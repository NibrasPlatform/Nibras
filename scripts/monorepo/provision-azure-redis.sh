#!/usr/bin/env bash
# Deploy internal Redis on Azure Container Apps (NestJS sessions/cache).
set -euo pipefail

RG="${RG:-nibras-rg}"
ENV_NAME="${ENV_NAME:-nibras-env}"
APP="${APP:-nibras-redis}"

if az containerapp show -n "$APP" -g "$RG" >/dev/null 2>&1; then
  echo "Redis app '$APP' already exists."
else
  echo "Creating internal Redis container app '$APP' ..."
  az containerapp create -n "$APP" -g "$RG" \
    --environment "$ENV_NAME" \
    --image "redis:7-alpine" \
    --ingress internal \
    --target-port 6379 \
    --cpu 0.25 --memory 0.5Gi \
    --min-replicas 1 --max-replicas 1 \
    -o none
fi

echo "REDIS_HOST=${APP}"
echo "REDIS_PORT=6379"
