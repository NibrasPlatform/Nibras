#!/usr/bin/env bash
# Deploy nibras stack to Azure Container Apps (api, web, worker, backend, mongo, redis).
#
# Usage:
#   source /tmp/nibras-azure-secrets.env
#   bash scripts/monorepo/deploy-azure-stack.sh
#   DEPLOY_WORKER=1 DEPLOY_BACKEND=1 bash scripts/monorepo/deploy-azure-stack.sh
#   WEB_TAG=abc API_TAG=abc WORKER_TAG=abc BACKEND_TAG=abc bash scripts/monorepo/deploy-azure-stack.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RG="${RG:-nibras-rg}"
ENV_NAME="${ENV_NAME:-nibras-env}"
ACR_NAME="${ACR_NAME:-nibrasacr4b4c9b7e}"
TAG="${TAG:-$(git -C "$ROOT" rev-parse --short HEAD)}"
API_TAG="${API_TAG:-$TAG}"
WEB_TAG="${WEB_TAG:-$TAG}"
WORKER_TAG="${WORKER_TAG:-$TAG}"
BACKEND_TAG="${BACKEND_TAG:-$TAG}"
SECRETS_FILE="${SECRETS_FILE:-/tmp/nibras-azure-secrets.env}"
DEPLOY_WORKER="${DEPLOY_WORKER:-1}"
DEPLOY_BACKEND="${DEPLOY_BACKEND:-1}"
DEPLOY_MONGO="${DEPLOY_MONGO:-1}"
DEPLOY_REDIS="${DEPLOY_REDIS:-1}"
BUILD_IMAGES="${BUILD_IMAGES:-0}"

LOGIN_SERVER="${ACR_NAME}.azurecr.io"
ACR_USER="${ACR_NAME}"
ACR_PASS="$(az acr credential show -n "$ACR_NAME" --query 'passwords[0].value' -o tsv)"

if [[ -f "$SECRETS_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
fi

if [[ "${DATABASE_URL:-}" == *".railway.internal"* ]]; then
  echo "error: DATABASE_URL uses Railway private host — use DATABASE_PUBLIC_URL for Azure." >&2
  exit 1
fi

: "${DATABASE_URL:?DATABASE_URL required}"
: "${AUTH_SECRET:?AUTH_SECRET required}"
: "${NIBRAS_ENCRYPTION_KEY:?NIBRAS_ENCRYPTION_KEY required}"

NESTJS_ORIGIN="${NIBRAS_NESTJS_ORIGIN:-}"
COURSES_API_URL="${NIBRAS_COURSES_API_URL:-https://nibras-backend.up.railway.app/api}"
RECOMMENDATION_API_URL="${NIBRAS_RECOMMENDATION_API_URL:-https://recommendationmodel-production-c22c.up.railway.app/api/recommend}"

build_and_push() {
  local dockerfile="$1"
  local image_name="$2"
  local tag="$3"
  echo "Building ${image_name}:${tag} ..."
  docker build -f "$dockerfile" -t "${LOGIN_SERVER}/${image_name}:${tag}" "$ROOT"
  docker push "${LOGIN_SERVER}/${image_name}:${tag}"
}

if [[ "$BUILD_IMAGES" == "1" ]]; then
  echo "Logging into ACR ..."
  echo "$ACR_PASS" | docker login "$LOGIN_SERVER" -u "$ACR_USER" --password-stdin
  build_and_push Dockerfile.api nibras-api "$API_TAG"
  build_and_push Dockerfile.gateway nibras-web "$WEB_TAG"
  if [[ "$DEPLOY_WORKER" == "1" ]]; then
    build_and_push Dockerfile.worker nibras-worker "$WORKER_TAG"
  fi
  if [[ "$DEPLOY_BACKEND" == "1" ]]; then
    build_and_push Dockerfile.backend nibras-backend "$BACKEND_TAG"
  fi
fi

if [[ "$DEPLOY_MONGO" == "1" && -z "${MONGO_URI:-}" ]]; then
  mongo_out="$(bash "$ROOT/scripts/monorepo/provision-azure-mongo.sh")"
  echo "$mongo_out"
  MONGO_URI="$(echo "$mongo_out" | sed -n 's/^MONGO_URI=//p')"
fi

if [[ "$DEPLOY_REDIS" == "1" ]]; then
  bash "$ROOT/scripts/monorepo/provision-azure-redis.sh"
  REDIS_HOST="${REDIS_HOST:-nibras-redis}"
  REDIS_PORT="${REDIS_PORT:-6379}"
fi

create_or_update_api() {
  local image="${LOGIN_SERVER}/nibras-api:${API_TAG}"
  local web_cors_origin="${NIBRAS_WEB_CORS_ORIGINS:-}"
  if [[ -z "$web_cors_origin" ]] && az containerapp show -n nibras-web -g "$RG" >/dev/null 2>&1; then
    local web_fqdn
    web_fqdn="$(az containerapp show -n nibras-web -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
    web_cors_origin="https://${web_fqdn}"
  fi
  local chatbot_url=""
  if az containerapp show -n nibras-chatbot-v1 -g "$RG" >/dev/null 2>&1; then
    local chatbot_fqdn
    chatbot_fqdn="$(az containerapp show -n nibras-chatbot-v1 -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
    chatbot_url="https://${chatbot_fqdn}"
  fi
  local api_env=(
    "NODE_ENV=production"
    "HOST=0.0.0.0"
    "PORT=4848"
    "COMPETITIONS_SYNC_ENABLED=false"
    "DATABASE_URL=secretref:database-url"
    "DIRECT_DATABASE_URL=secretref:direct-database-url"
    "AUTH_SECRET=secretref:auth-secret"
    "NIBRAS_ENCRYPTION_KEY=secretref:encryption-key"
    "NIBRAS_INTERNAL_API_TOKEN=secretref:internal-token"
    "OPENAI_API_KEY=secretref:openai-api-key"
    "NIBRAS_AI_API_KEY=secretref:openai-api-key"
    "NIBRAS_WEB_CORS_ORIGINS=${web_cors_origin}"
  )
  if [[ -n "$chatbot_url" ]]; then
    api_env+=("CHATBOT_V1_URL=${chatbot_url}")
  fi
  if az containerapp show -n nibras-api -g "$RG" >/dev/null 2>&1; then
    az containerapp secret set -n nibras-api -g "$RG" \
      --secrets \
        "database-url=${DATABASE_URL}" \
        "direct-database-url=${DIRECT_DATABASE_URL:-$DATABASE_URL}" \
        "auth-secret=${AUTH_SECRET}" \
        "encryption-key=${NIBRAS_ENCRYPTION_KEY}" \
        "internal-token=${NIBRAS_INTERNAL_API_TOKEN:-}" \
        "openai-api-key=${OPENAI_API_KEY:-${NIBRAS_AI_API_KEY:-}}" \
      -o none
    az containerapp update -n nibras-api -g "$RG" --image "$image" -o none
    az containerapp update -n nibras-api -g "$RG" \
      --set-env-vars "${api_env[@]}" \
      -o none
  else
    az containerapp create -n nibras-api -g "$RG" \
      --environment "$ENV_NAME" \
      --image "$image" \
      --registry-server "$LOGIN_SERVER" \
      --registry-username "$ACR_USER" \
      --registry-password "$ACR_PASS" \
      --target-port 4848 --ingress external \
      --cpu 1.0 --memory 2Gi \
      --min-replicas 1 --max-replicas 2 \
      --secrets \
        "database-url=${DATABASE_URL}" \
        "direct-database-url=${DIRECT_DATABASE_URL:-$DATABASE_URL}" \
        "auth-secret=${AUTH_SECRET}" \
        "encryption-key=${NIBRAS_ENCRYPTION_KEY}" \
        "internal-token=${NIBRAS_INTERNAL_API_TOKEN:-}" \
        "openai-api-key=${OPENAI_API_KEY:-${NIBRAS_AI_API_KEY:-}}" \
      --env-vars "${api_env[@]}" \
      -o none
  fi
}

create_or_update_web() {
  local api_fqdn
  api_fqdn="$(az containerapp show -n nibras-api -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
  local image="${LOGIN_SERVER}/nibras-web:${WEB_TAG}"
  local google_client_id="${NIBRAS_GOOGLE_CLIENT_ID:-561316297025-c9ohua7q6sa91nn2eetsprac65a3oog6.apps.googleusercontent.com}"
  local nestjs="${NESTJS_ORIGIN:-https://backend-production-129d.up.railway.app}"
  if [[ -z "$NESTJS_ORIGIN" ]] && az containerapp show -n nibras-backend -g "$RG" >/dev/null 2>&1; then
    local backend_fqdn
    backend_fqdn="$(az containerapp show -n nibras-backend -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
    nestjs="https://${backend_fqdn}"
  fi
  if az containerapp show -n nibras-web -g "$RG" >/dev/null 2>&1; then
    az containerapp update -n nibras-web -g "$RG" --image "$image" -o none
    az containerapp update -n nibras-web -g "$RG" \
      --set-env-vars \
        "NODE_ENV=production" \
        "NIBRAS_STATIC_ROOT=Frontend/client" \
        "NIBRAS_FASTIFY_ORIGIN=https://${api_fqdn}" \
        "NIBRAS_NESTJS_ORIGIN=${nestjs}" \
        "NIBRAS_GOOGLE_CLIENT_ID=${google_client_id}" \
        "NIBRAS_COURSES_API_URL=${COURSES_API_URL}" \
        "NIBRAS_RECOMMENDATION_API_URL=${RECOMMENDATION_API_URL}" \
      -o none
  else
    az containerapp create -n nibras-web -g "$RG" \
      --environment "$ENV_NAME" \
      --image "$image" \
      --registry-server "$LOGIN_SERVER" \
      --registry-username "$ACR_USER" \
      --registry-password "$ACR_PASS" \
      --target-port 8080 --ingress external \
      --cpu 0.5 --memory 1Gi \
      --min-replicas 1 --max-replicas 2 \
      --env-vars \
        "NODE_ENV=production" \
        "NIBRAS_STATIC_ROOT=Frontend/client" \
        "NIBRAS_FASTIFY_ORIGIN=https://${api_fqdn}" \
        "NIBRAS_NESTJS_ORIGIN=${nestjs}" \
        "NIBRAS_GOOGLE_CLIENT_ID=${google_client_id}" \
        "NIBRAS_COURSES_API_URL=${COURSES_API_URL}" \
        "NIBRAS_RECOMMENDATION_API_URL=${RECOMMENDATION_API_URL}" \
      -o none
  fi
}

create_or_update_worker() {
  local image="${LOGIN_SERVER}/nibras-worker:${WORKER_TAG}"
  local web_fqdn=""
  if az containerapp show -n nibras-web -g "$RG" >/dev/null 2>&1; then
    web_fqdn="$(az containerapp show -n nibras-web -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
  fi
  local web_base="${NIBRAS_WEB_BASE_URL:-https://${web_fqdn}}"
  if az containerapp show -n nibras-worker -g "$RG" >/dev/null 2>&1; then
    az containerapp secret set -n nibras-worker -g "$RG" \
      --secrets \
        "database-url=${DATABASE_URL}" \
        "direct-database-url=${DIRECT_DATABASE_URL:-$DATABASE_URL}" \
        "auth-secret=${AUTH_SECRET}" \
        "encryption-key=${NIBRAS_ENCRYPTION_KEY}" \
        "internal-token=${NIBRAS_INTERNAL_API_TOKEN:-}" \
        "openai-api-key=${OPENAI_API_KEY:-${NIBRAS_AI_API_KEY:-}}" \
      -o none
    az containerapp update -n nibras-worker -g "$RG" --image "$image" -o none
    az containerapp update -n nibras-worker -g "$RG" \
      --set-env-vars \
        "NODE_ENV=production" \
        "COMPETITIONS_SYNC_ENABLED=true" \
        "DATABASE_URL=secretref:database-url" \
        "DIRECT_DATABASE_URL=secretref:direct-database-url" \
        "AUTH_SECRET=secretref:auth-secret" \
        "NIBRAS_ENCRYPTION_KEY=secretref:encryption-key" \
        "NIBRAS_INTERNAL_API_TOKEN=secretref:internal-token" \
        "OPENAI_API_KEY=secretref:openai-api-key" \
        "NIBRAS_AI_API_KEY=secretref:openai-api-key" \
        "NIBRAS_WEB_BASE_URL=${web_base}" \
      -o none
  else
    az containerapp create -n nibras-worker -g "$RG" \
      --environment "$ENV_NAME" \
      --image "$image" \
      --registry-server "$LOGIN_SERVER" \
      --registry-username "$ACR_USER" \
      --registry-password "$ACR_PASS" \
      --ingress internal \
      --target-port 9090 \
      --cpu 0.5 --memory 1Gi \
      --min-replicas 1 --max-replicas 1 \
      --secrets \
        "database-url=${DATABASE_URL}" \
        "direct-database-url=${DIRECT_DATABASE_URL:-$DATABASE_URL}" \
        "auth-secret=${AUTH_SECRET}" \
        "encryption-key=${NIBRAS_ENCRYPTION_KEY}" \
        "internal-token=${NIBRAS_INTERNAL_API_TOKEN:-}" \
        "openai-api-key=${OPENAI_API_KEY:-${NIBRAS_AI_API_KEY:-}}" \
      --env-vars \
        "NODE_ENV=production" \
        "COMPETITIONS_SYNC_ENABLED=true" \
        "DATABASE_URL=secretref:database-url" \
        "DIRECT_DATABASE_URL=secretref:direct-database-url" \
        "AUTH_SECRET=secretref:auth-secret" \
        "NIBRAS_ENCRYPTION_KEY=secretref:encryption-key" \
        "NIBRAS_INTERNAL_API_TOKEN=secretref:internal-token" \
        "OPENAI_API_KEY=secretref:openai-api-key" \
        "NIBRAS_AI_API_KEY=secretref:openai-api-key" \
        "NIBRAS_WEB_BASE_URL=${web_base}" \
      -o none
  fi
}

create_or_update_backend() {
  : "${MONGO_URI:?MONGO_URI required for nibras-backend — run provision-azure-mongo.sh}"
  local image="${LOGIN_SERVER}/nibras-backend:${BACKEND_TAG}"
  local web_fqdn=""
  if az containerapp show -n nibras-web -g "$RG" >/dev/null 2>&1; then
    web_fqdn="$(az containerapp show -n nibras-web -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
  fi
  local web_base="${NIBRAS_WEB_BASE_URL:-https://${web_fqdn}}"
  local backend_fqdn=""
  local redis_host="${REDIS_HOST:-nibras-redis}"
  local redis_port="${REDIS_PORT:-6379}"
  if az containerapp show -n nibras-backend -g "$RG" >/dev/null 2>&1; then
    az containerapp secret set -n nibras-backend -g "$RG" \
      --secrets \
        "mongo-uri=${MONGO_URI}" \
        "auth-secret=${AUTH_SECRET}" \
      -o none
    az containerapp update -n nibras-backend -g "$RG" --image "$image" -o none
    az containerapp update -n nibras-backend -g "$RG" \
      --set-env-vars \
        "NODE_ENV=production" \
        "HOST=0.0.0.0" \
        "PORT=3000" \
        "MONGO_URI=secretref:mongo-uri" \
        "AUTH_SECRET=secretref:auth-secret" \
        "REDIS_HOST=${redis_host}" \
        "REDIS_PORT=${redis_port}" \
        "WEB_BASE_URL=${web_base}" \
        "API_BASE_URL=${web_base}/api" \
      -o none
    backend_fqdn="$(az containerapp show -n nibras-backend -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
  else
    az containerapp create -n nibras-backend -g "$RG" \
      --environment "$ENV_NAME" \
      --image "$image" \
      --registry-server "$LOGIN_SERVER" \
      --registry-username "$ACR_USER" \
      --registry-password "$ACR_PASS" \
      --target-port 3000 --ingress external \
      --cpu 0.5 --memory 1Gi \
      --min-replicas 1 --max-replicas 2 \
      --secrets \
        "mongo-uri=${MONGO_URI}" \
        "auth-secret=${AUTH_SECRET}" \
      --env-vars \
        "NODE_ENV=production" \
        "HOST=0.0.0.0" \
        "PORT=3000" \
        "MONGO_URI=secretref:mongo-uri" \
        "AUTH_SECRET=secretref:auth-secret" \
        "REDIS_HOST=${redis_host}" \
        "REDIS_PORT=${redis_port}" \
        "WEB_BASE_URL=${web_base}" \
        "API_BASE_URL=${web_base}/api" \
      -o none
    backend_fqdn="$(az containerapp show -n nibras-backend -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
  fi
  echo "NestJS backend: https://${backend_fqdn}"
  NESTJS_ORIGIN="https://${backend_fqdn}"
}

echo "Deploying nibras-api:${API_TAG} ..."
create_or_update_api
API_FQDN="$(az containerapp show -n nibras-api -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
echo "API: https://${API_FQDN}"

if [[ "$DEPLOY_BACKEND" == "1" ]]; then
  echo "Deploying nibras-backend:${BACKEND_TAG} ..."
  create_or_update_backend
fi

if [[ "$DEPLOY_WORKER" == "1" ]]; then
  echo "Deploying nibras-worker:${WORKER_TAG} ..."
  create_or_update_worker
fi

echo "Deploying nibras-web:${WEB_TAG} ..."
create_or_update_web
WEB_FQDN="$(az containerapp show -n nibras-web -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
echo "Web: https://${WEB_FQDN}"

if az containerapp show -n nibras-api -g "$RG" >/dev/null 2>&1; then
  echo "Updating API CORS for web origin ..."
  az containerapp update -n nibras-api -g "$RG" \
    --set-env-vars "NIBRAS_WEB_CORS_ORIGINS=https://${WEB_FQDN}" \
    -o none
fi
