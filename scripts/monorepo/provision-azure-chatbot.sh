#!/usr/bin/env bash
# Create or update nibras-chatbot-v1 on Azure Container Apps.
set -euo pipefail

RG="${RG:-nibras-rg}"
ENV_NAME="${ENV_NAME:-nibras-env}"
APP="${APP:-nibras-chatbot-v1}"
ACR_NAME="${ACR_NAME:-nibrasacr4b4c9b7e}"
TAG="${TAG:-$(git rev-parse --short HEAD)}"
API_FQDN="${API_FQDN:-}"

if [[ -z "$API_FQDN" ]]; then
  API_FQDN="$(az containerapp show -n nibras-api -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv 2>/dev/null || true)"
fi
if [[ -z "$API_FQDN" ]]; then
  echo "error: set API_FQDN or deploy nibras-api first." >&2
  exit 1
fi

LOGIN_SERVER="${ACR_NAME}.azurecr.io"
IMAGE="${LOGIN_SERVER}/nibras-chatbot-v1:${TAG}"
ACR_USER="${ACR_NAME}"
ACR_PASS="$(az acr credential show -n "$ACR_NAME" --query 'passwords[0].value' -o tsv)"

if az containerapp show -n "$APP" -g "$RG" >/dev/null 2>&1; then
  az containerapp update -n "$APP" -g "$RG" --image "$IMAGE" -o none
  az containerapp update -n "$APP" -g "$RG" \
    --set-env-vars \
      "NIBRAS_AI_MODEL=gpt-4o-mini" \
      "NIBRAS_API_URL=https://${API_FQDN}/v1/community" \
      "NIBRAS_API_ORIGIN=https://${API_FQDN}" \
    -o none
else
  az containerapp create -n "$APP" -g "$RG" \
    --environment "$ENV_NAME" \
    --image "$IMAGE" \
    --registry-server "$LOGIN_SERVER" \
    --registry-username "$ACR_USER" \
    --registry-password "$ACR_PASS" \
    --target-port 5000 --ingress external \
    --cpu 0.5 --memory 1Gi \
    --min-replicas 0 --max-replicas 1 \
    --env-vars \
      "NIBRAS_AI_MODEL=gpt-4o-mini" \
      "NIBRAS_API_URL=https://${API_FQDN}/v1/community" \
      "NIBRAS_API_ORIGIN=https://${API_FQDN}" \
    -o none
fi

FQDN="$(az containerapp show -n "$APP" -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
echo "Tutor URL: https://${FQDN}"
