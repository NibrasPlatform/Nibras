#!/usr/bin/env bash
# Deploy nibras-api and nibras-web to Azure Container Apps (rabie subscription).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RG="${RG:-nibras-rg}"
ENV_NAME="${ENV_NAME:-nibras-env}"
ACR_NAME="${ACR_NAME:-nibrasacr4b4c9b7e}"
TAG="${TAG:-$(git -C "$ROOT" rev-parse --short HEAD)}"
API_TAG="${API_TAG:-$TAG}"
WEB_TAG="${WEB_TAG:-$TAG}"
SECRETS_FILE="${SECRETS_FILE:-/tmp/nibras-azure-secrets.env}"

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

NESTJS_ORIGIN="${NIBRAS_NESTJS_ORIGIN:-https://backend-production-129d.up.railway.app}"

create_or_update_api() {
  local image="${LOGIN_SERVER}/nibras-api:${API_TAG}"
  local web_cors_origin="${NIBRAS_WEB_CORS_ORIGINS:-}"
  if [[ -z "$web_cors_origin" ]] && az containerapp show -n nibras-web -g "$RG" >/dev/null 2>&1; then
    local web_fqdn
    web_fqdn="$(az containerapp show -n nibras-web -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
    web_cors_origin="https://${web_fqdn}"
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
      --set-env-vars \
        "NODE_ENV=production" \
        "HOST=0.0.0.0" \
        "PORT=4848" \
        "COMPETITIONS_SYNC_ENABLED=false" \
        "DATABASE_URL=secretref:database-url" \
        "DIRECT_DATABASE_URL=secretref:direct-database-url" \
        "AUTH_SECRET=secretref:auth-secret" \
        "NIBRAS_ENCRYPTION_KEY=secretref:encryption-key" \
        "NIBRAS_INTERNAL_API_TOKEN=secretref:internal-token" \
        "OPENAI_API_KEY=secretref:openai-api-key" \
        "NIBRAS_AI_API_KEY=secretref:openai-api-key" \
        "NIBRAS_WEB_CORS_ORIGINS=${web_cors_origin}" \
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
      --env-vars \
        "NODE_ENV=production" \
        "HOST=0.0.0.0" \
        "PORT=4848" \
        "COMPETITIONS_SYNC_ENABLED=false" \
        "DATABASE_URL=secretref:database-url" \
        "DIRECT_DATABASE_URL=secretref:direct-database-url" \
        "AUTH_SECRET=secretref:auth-secret" \
        "NIBRAS_ENCRYPTION_KEY=secretref:encryption-key" \
        "NIBRAS_INTERNAL_API_TOKEN=secretref:internal-token" \
        "OPENAI_API_KEY=secretref:openai-api-key" \
        "NIBRAS_AI_API_KEY=secretref:openai-api-key" \
        "NIBRAS_WEB_CORS_ORIGINS=${web_cors_origin}" \
      -o none
  fi
}

create_or_update_web() {
  local api_fqdn
  api_fqdn="$(az containerapp show -n nibras-api -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
  local image="${LOGIN_SERVER}/nibras-web:${WEB_TAG}"
  local google_client_id="${NIBRAS_GOOGLE_CLIENT_ID:-561316297025-c9ohua7q6sa91nn2eetsprac65a3oog6.apps.googleusercontent.com}"
  if az containerapp show -n nibras-web -g "$RG" >/dev/null 2>&1; then
    az containerapp update -n nibras-web -g "$RG" --image "$image" -o none
    az containerapp update -n nibras-web -g "$RG" \
      --set-env-vars \
        "NODE_ENV=production" \
        "NIBRAS_STATIC_ROOT=Frontend/client" \
        "NIBRAS_FASTIFY_ORIGIN=https://${api_fqdn}" \
        "NIBRAS_NESTJS_ORIGIN=${NESTJS_ORIGIN}" \
        "NIBRAS_GOOGLE_CLIENT_ID=${google_client_id}" \
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
        "NIBRAS_NESTJS_ORIGIN=${NESTJS_ORIGIN}" \
        "NIBRAS_GOOGLE_CLIENT_ID=${google_client_id}" \
      -o none
  fi
}

echo "Deploying nibras-api:${API_TAG} ..."
create_or_update_api
API_FQDN="$(az containerapp show -n nibras-api -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
echo "API: https://${API_FQDN}"

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
