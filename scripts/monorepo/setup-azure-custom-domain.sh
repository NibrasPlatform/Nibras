#!/usr/bin/env bash
# Point Cloudflare DNS at Azure Container Apps web FQDN (CNAME).
#
# Usage:
#   CF_API_TOKEN=... bash scripts/monorepo/setup-azure-custom-domain.sh
#
# Optional:
#   ZONE_NAME=nibrasplatform.me
#   RECORD_NAME=nibrasplatform.me
#   RG=nibras-rg

set -euo pipefail

ZONE_NAME="${ZONE_NAME:-nibrasplatform.me}"
RECORD_NAME="${RECORD_NAME:-nibrasplatform.me}"
RG="${RG:-nibras-rg}"
WEB_APP="${WEB_APP:-nibras-web}"
TOKEN="${CF_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"

if [[ -z "$TOKEN" ]]; then
  cat <<EOF
Usage: CF_API_TOKEN=... bash scripts/monorepo/setup-azure-custom-domain.sh

Manual steps:
  1. Azure Portal → $WEB_APP → Custom domains → Add
  2. Cloudflare DNS → CNAME @ → <web-fqdn without https://> (proxied)
  3. Re-run setup-azure-google-oauth.sh with custom domain origin
  4. Update NIBRAS_WEB_BASE_URL via setup-azure-email.sh
EOF
  exit 1
fi

WEB_FQDN="$(az containerapp show -n "$WEB_APP" -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
ZONE_ID="$(curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=$ZONE_NAME" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result'][0]['id'])")"

RECORD_ID="$(curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=CNAME&name=$RECORD_NAME" \
  | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print(r[0]['id'] if r else '')")"

PAYLOAD="$(python3 - <<PY
import json
print(json.dumps({"type":"CNAME","name":"$RECORD_NAME","content":"$WEB_FQDN","ttl":1,"proxied":True}))
PY
)"

if [[ -n "$RECORD_ID" ]]; then
  curl -fsS -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" \
    -d "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print('updated', d['success'])"
else
  curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
    -d "$PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print('created', d['success'])"
fi

echo "CNAME $RECORD_NAME → $WEB_FQDN"
echo "Next: bind custom domain on ACA and set SSL/TLS Full (strict) in Cloudflare."
