#!/usr/bin/env bash
# Smoke-check Azure Container Apps stack (web gateway + api + external deps).
#
# Usage:
#   NIBRAS_BASE_URL=https://nibras-web....azurecontainerapps.io \
#     bash scripts/monorepo/health-check-azure.sh
#
# Optional env:
#   NIBRAS_API_FQDN          — direct API FQDN (auto-detected from az CLI when logged in)
#   NIBRAS_CHATBOT_FQDN      — chatbot-v1 FQDN (auto-detected)
#   NIBRAS_TEST_EMAIL        — run authenticated checks when set with NIBRAS_TEST_PASSWORD
#   NIBRAS_COURSES_API       — courses API base (default: Railway nibras-backend)
#   NIBRAS_RECOMMENDATION_API — recommendation API (default: Railway)
#   SKIP_AZURE_CLI=1         — skip az containerapp status checks

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RG="${RG:-nibras-rg}"
BASE_URL="${NIBRAS_BASE_URL:-https://nibras-web.agreeablebush-214764d1.uaenorth.azurecontainerapps.io}"
BASE_URL="${BASE_URL%/}"
DEFAULT_COURSES_API="${NIBRAS_COURSES_API:-https://nibras-backend.up.railway.app/api}"
DEFAULT_REC_API="${NIBRAS_RECOMMENDATION_API:-https://recommendationmodel-production-c22c.up.railway.app}"
FAIL=0

pass() { echo "OK:   $1"; }
warn() { echo "WARN: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }

request() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local extra_headers="${4:-}"
  local args=(-sS -w "\n%{http_code}" -X "$method" "$url")
  if [[ -n "$data" ]]; then
    args+=(-H "Content-Type: application/json" -d "$data")
  fi
  if [[ -n "$extra_headers" ]]; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && args+=(-H "$line")
    done <<<"$extra_headers"
  fi
  local out
  out="$(curl "${args[@]}" 2>/dev/null || printf '\n000')"
  HTTP_STATUS="${out##*$'\n'}"
  HTTP_BODY="${out%$'\n'*}"
}

assert_status() {
  local expected="$1"
  local label="$2"
  if [[ "$HTTP_STATUS" == "$expected" ]]; then
    pass "$label (HTTP $HTTP_STATUS)"
  else
    fail "$label — expected HTTP $expected, got $HTTP_STATUS — body: ${HTTP_BODY:0:200}"
  fi
}

assert_status_any() {
  local label="$1"
  shift
  for code in "$@"; do
    if [[ "$HTTP_STATUS" == "$code" ]]; then
      pass "$label (HTTP $HTTP_STATUS)"
      return 0
    fi
  done
  fail "$label — expected one of [$*], got $HTTP_STATUS — body: ${HTTP_BODY:0:200}"
}

echo "Azure health check: ${BASE_URL}"
echo

if [[ "${SKIP_AZURE_CLI:-}" != "1" ]] && command -v az >/dev/null 2>&1 && az account show >/dev/null 2>&1; then
  echo "==> Azure Container Apps ($RG)"
  for app in nibras-web nibras-api nibras-chatbot-v1 nibras-worker nibras-backend nibras-mongo nibras-redis; do
    state="$(az containerapp show -g "$RG" -n "$app" --query 'properties.runningStatus' -o tsv 2>/dev/null || echo missing)"
    if [[ "$state" == "Running" ]]; then
      pass "containerapp $app ($state)"
    elif [[ "$state" == "missing" ]]; then
      warn "containerapp $app (not deployed)"
    else
      fail "containerapp $app ($state)"
    fi
  done

  if [[ -z "${NIBRAS_API_FQDN:-}" ]]; then
    NIBRAS_API_FQDN="$(az containerapp show -g "$RG" -n nibras-api --query 'properties.configuration.ingress.fqdn' -o tsv 2>/dev/null || true)"
  fi
  if [[ -z "${NIBRAS_CHATBOT_FQDN:-}" ]]; then
    NIBRAS_CHATBOT_FQDN="$(az containerapp show -g "$RG" -n nibras-chatbot-v1 --query 'properties.configuration.ingress.fqdn' -o tsv 2>/dev/null || true)"
  fi
  echo
fi

echo "==> Web gateway"
request GET "${BASE_URL}/healthz"
assert_status 200 "GET /healthz"

request GET "${BASE_URL}/readyz"
assert_status 200 "GET /readyz"

request GET "${BASE_URL}/gateway-host.js"
assert_status 200 "GET /gateway-host.js"
echo "$HTTP_BODY" | grep -q 'isGatewayHost' || fail "gateway-host.js missing isGatewayHost"

request GET "${BASE_URL}/oauth-config.js"
assert_status 200 "GET /oauth-config.js"

request GET "${BASE_URL}/azure-services-config.js"
if [[ "$HTTP_STATUS" == "200" ]]; then
  pass "GET /azure-services-config.js"
else
  warn "GET /azure-services-config.js (HTTP $HTTP_STATUS — optional until web redeployed)"
fi

request GET "${BASE_URL}/Login/loginPage/login.html"
assert_status 200 "GET login page"

echo
echo "==> Fastify API (via web proxy)"
request POST "${BASE_URL}/api/auth/login" '{"email":"invalid@example.com","password":"wrong"}'
assert_status_any "POST /api/auth/login (routing)" 400 401

request GET "${BASE_URL}/v1/community/chatbot/config"
assert_status 200 "GET /v1/community/chatbot/config"

request GET "${BASE_URL}/v1/tracking/catalog"
assert_status 401 "GET /v1/tracking/catalog without token (auth enforced)"

request GET "${BASE_URL}/contests"
assert_status_any "GET /contests" 200 404

request GET "${BASE_URL}/api/ping"
assert_status 200 "GET /api/ping (NestJS via proxy)"
echo "$HTTP_BODY" | grep -q '"status"' || warn "/api/ping body unexpected: ${HTTP_BODY:0:120}"

request GET "${BASE_URL}/v1/ide/status"
assert_status_any "GET /v1/ide/status" 200 503
if echo "$HTTP_BODY" | grep -q '"configured":true'; then
  pass "IDE configured"
  if echo "$HTTP_BODY" | grep -q '"reachable":true'; then
    pass "IDE reachable"
  else
    warn "IDE configured but not reachable"
  fi
else
  warn "IDE not configured ($HTTP_BODY)"
fi

echo
echo "==> Direct API (when FQDN known)"
if [[ -n "${NIBRAS_API_FQDN:-}" ]]; then
  request GET "https://${NIBRAS_API_FQDN}/readyz"
  assert_status 200 "GET https://${NIBRAS_API_FQDN}/readyz"
else
  warn "NIBRAS_API_FQDN unknown — skip direct API checks"
fi

echo
echo "==> AI Tutor (chatbot-v1)"
if [[ -n "${NIBRAS_CHATBOT_FQDN:-}" ]]; then
  request GET "https://${NIBRAS_CHATBOT_FQDN}/api/health"
  assert_status_any "GET chatbot /api/health" 200 204
else
  warn "NIBRAS_CHATBOT_FQDN unknown — skip direct tutor checks"
fi

echo
echo "==> External dependencies"
request GET "${DEFAULT_COURSES_API}/courses?limit=1"
if [[ "$HTTP_STATUS" == "200" ]]; then
  pass "courses API reachable ($DEFAULT_COURSES_API)"
else
  warn "courses API HTTP $HTTP_STATUS ($DEFAULT_COURSES_API)"
fi

request GET "${DEFAULT_REC_API}/health" 2>/dev/null || true
if [[ "$HTTP_STATUS" == "200" ]] || [[ "$HTTP_STATUS" == "404" ]]; then
  pass "recommendation service reachable ($DEFAULT_REC_API)"
else
  request POST "${DEFAULT_REC_API}" '{"grades":[]}' 2>/dev/null || true
  if [[ "$HTTP_STATUS" =~ ^[234] ]]; then
    pass "recommendation service reachable via POST ($DEFAULT_REC_API)"
  else
    warn "recommendation service HTTP $HTTP_STATUS ($DEFAULT_REC_API)"
  fi
fi

echo
echo "==> Authenticated flows (optional)"
if [[ -n "${NIBRAS_TEST_EMAIL:-}" && -n "${NIBRAS_TEST_PASSWORD:-}" ]]; then
  request POST "${BASE_URL}/api/auth/login" \
    "{\"email\":\"${NIBRAS_TEST_EMAIL}\",\"password\":\"${NIBRAS_TEST_PASSWORD}\"}"
  assert_status 200 "POST /api/auth/login (test account)"
  if command -v jq >/dev/null 2>&1; then
    TOKEN="$(echo "$HTTP_BODY" | jq -r '.accessToken // empty')"
    if [[ -n "$TOKEN" ]]; then
      pass "login returned accessToken"
      request GET "${BASE_URL}/v1/tracking/catalog" "" "Authorization: Bearer ${TOKEN}"
      assert_status 200 "GET /v1/tracking/catalog (authenticated)"
    else
      fail "login missing accessToken"
    fi
  fi
else
  warn "Set NIBRAS_TEST_EMAIL + NIBRAS_TEST_PASSWORD for authenticated checks"
fi

echo
if [[ "$FAIL" -eq 0 ]]; then
  echo "All required Azure health checks passed."
  exit 0
fi
echo "Some Azure health checks failed."
exit 1
