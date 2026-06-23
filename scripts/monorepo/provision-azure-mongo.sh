#!/usr/bin/env bash
# Deploy internal MongoDB on Azure Container Apps (same environment as nibras-api).
set -euo pipefail

RG="${RG:-nibras-rg}"
ENV_NAME="${ENV_NAME:-nibras-env}"
APP="${APP:-nibras-mongo}"
MONGO_USER="${MONGO_USER:-mongo}"
MONGO_PASSWORD="${MONGO_PASSWORD:-$(openssl rand -hex 16)}"
MONGO_DB="${MONGO_DB:-nibras}"

if az containerapp show -n "$APP" -g "$RG" >/dev/null 2>&1; then
  echo "MongoDB app '$APP' already exists."
  MONGO_PASSWORD="$(az containerapp show -n "$APP" -g "$RG" \
    --query "properties.template.containers[0].env[?name=='MONGO_INITDB_ROOT_PASSWORD'].value | [0]" -o tsv)"
else
  echo "Creating internal MongoDB container app '$APP' ..."
  az containerapp create -n "$APP" -g "$RG" \
    --environment "$ENV_NAME" \
    --image "mongo:7" \
    --ingress internal \
    --target-port 27017 \
    --cpu 0.5 --memory 1Gi \
    --min-replicas 1 --max-replicas 1 \
    --env-vars \
      "MONGO_INITDB_ROOT_USERNAME=${MONGO_USER}" \
      "MONGO_INITDB_ROOT_PASSWORD=${MONGO_PASSWORD}" \
    -o none
fi

# Apps in the same environment resolve each other by app name.
MONGO_URI="mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${APP}:27017/${MONGO_DB}?authSource=admin"
echo "MONGO_URI=${MONGO_URI}"
echo "Export for backend deploy: export MONGO_URI='${MONGO_URI}'"
