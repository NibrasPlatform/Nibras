#!/usr/bin/env bash
# Wire Resend email env vars on nibras-api, nibras-worker, and nibras-web (Azure Container Apps).
#
# Usage:
#   RESEND_API_KEY=re_... ./scripts/monorepo/setup-azure-email.sh
#
# Or add RESEND_API_KEY to nibras/.env, then:
#   ./scripts/monorepo/setup-azure-email.sh
#
# Optional:
#   RG=nibras-rg
#   NIBRAS_EMAIL_FROM='Nibras <noreply@nibrasplatform.me>'
#   NIBRAS_WEB_BASE_URL=https://nibras-web....azurecontainerapps.io

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RG="${RG:-nibras-rg}"
NIBRAS_EMAIL_FROM="${NIBRAS_EMAIL_FROM:-Nibras <noreply@nibrasplatform.me>}"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

if [ -z "${NIBRAS_WEB_BASE_URL:-}" ] && command -v az >/dev/null 2>&1; then
  web_fqdn="$(az containerapp show -n nibras-web -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv 2>/dev/null || true)"
  if [ -n "$web_fqdn" ]; then
    NIBRAS_WEB_BASE_URL="https://${web_fqdn}"
  fi
fi
NIBRAS_WEB_BASE_URL="${NIBRAS_WEB_BASE_URL:-https://nibrasplatform.me}"

if [ -z "${RESEND_API_KEY:-}" ]; then
  if [ -t 0 ]; then
    read -rsp "Paste Resend API key (re_...): " RESEND_API_KEY
    echo
  fi
fi

if [ -z "${RESEND_API_KEY:-}" ]; then
  echo "error: RESEND_API_KEY is required (set in .env or env)" >&2
  exit 1
fi

if [[ ! "$RESEND_API_KEY" =~ ^re_ ]]; then
  echo "warning: key does not start with re_ — continuing anyway" >&2
fi

for app in nibras-api nibras-worker nibras-web; do
  if ! az containerapp show --name "$app" --resource-group "$RG" >/dev/null 2>&1; then
    echo "→ skip $app (not deployed)"
    continue
  fi
  echo "→ $app"
  az containerapp secret set \
    --name "$app" \
    --resource-group "$RG" \
    --secrets "resend-api-key=$RESEND_API_KEY"

  ENV_VARS=(
    "RESEND_API_KEY=secretref:resend-api-key"
    "NIBRAS_EMAIL_FROM=$NIBRAS_EMAIL_FROM"
    "NIBRAS_WEB_BASE_URL=$NIBRAS_WEB_BASE_URL"
  )
  if [ "$app" = "nibras-web" ]; then
    ENV_VARS+=("BETTER_AUTH_URL=$NIBRAS_WEB_BASE_URL")
  fi

  az containerapp update \
    --name "$app" \
    --resource-group "$RG" \
    --set-env-vars "${ENV_VARS[@]}"
done

echo
echo "Done. Email env on deployed apps:"
echo "  NIBRAS_EMAIL_FROM=$NIBRAS_EMAIL_FROM"
echo "  NIBRAS_WEB_BASE_URL=$NIBRAS_WEB_BASE_URL"
echo "  BETTER_AUTH_URL=$NIBRAS_WEB_BASE_URL (web only)"
echo
echo "Verify in Resend → Emails after OTP signup or password reset."
if az containerapp show -n nibras-worker -g "$RG" >/dev/null 2>&1; then
  echo "Worker min replicas:"
  az containerapp show -n nibras-worker -g "$RG" \
    --query "properties.template.scale.minReplicas" -o tsv
fi
