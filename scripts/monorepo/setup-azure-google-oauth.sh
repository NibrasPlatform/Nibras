#!/usr/bin/env bash
# Document and verify Google OAuth JavaScript origin for Azure web gateway.
#
# Google Cloud Console (manual — cannot be automated from repo):
#   1. APIs & Services → Credentials → OAuth 2.0 Client ID
#   2. Authorized JavaScript origins → Add:
#        https://nibras-web.agreeablebush-214764d1.uaenorth.azurecontainerapps.io
#   3. If using custom domain, add https://your-domain as well
#
# Usage:
#   bash scripts/monorepo/setup-azure-google-oauth.sh

set -euo pipefail

RG="${RG:-nibras-rg}"
WEB_APP="${WEB_APP:-nibras-web}"

if ! command -v az >/dev/null 2>&1; then
  echo "error: az CLI required" >&2
  exit 1
fi

FQDN="$(az containerapp show -n "$WEB_APP" -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv 2>/dev/null || true)"
if [[ -z "$FQDN" ]]; then
  echo "error: $WEB_APP not found in $RG" >&2
  exit 1
fi

ORIGIN="https://${FQDN}"
CLIENT_ID="$(az containerapp show -n "$WEB_APP" -g "$RG" \
  --query "properties.template.containers[0].env[?name=='NIBRAS_GOOGLE_CLIENT_ID'].value | [0]" -o tsv 2>/dev/null || true)"

cat <<EOF
Google OAuth setup for Azure
============================

Add this JavaScript origin in Google Cloud Console:
  ${ORIGIN}

OAuth client ID on web (verify matches GCP):
  ${CLIENT_ID:-not set}

After adding the origin, test in incognito:
  ${ORIGIN}/Login/loginPage/login.html

Custom domain: re-run this script after DNS cutover to print the new origin.
EOF
