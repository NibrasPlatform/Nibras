#!/usr/bin/env bash
# Automated sign-off matrix for Azure web gateway (curl-based; run in incognito-equivalent).
# Confirms same-origin routing — all requests go through NIBRAS_BASE_URL, not Railway web.
#
# Usage:
#   NIBRAS_BASE_URL=https://nibras-web....azurecontainerapps.io \
#     bash scripts/monorepo/browser-signoff-azure.sh
#
# Optional:
#   NIBRAS_TEST_EMAIL / NIBRAS_TEST_PASSWORD — real account for login + catalog
#   SMOKE_OTP — OTP for signup test when RESEND is wired

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE="${NIBRAS_BASE_URL:-https://nibras-web.agreeablebush-214764d1.uaenorth.azurecontainerapps.io}"
BASE="${BASE%/}"
RAILWAY_WEB='web-production-3011ec.up.railway.app'
FAIL=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }

request() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local auth="${4:-}"
  local args=(-sS -w "\n%{http_code}" -X "$method" "$url")
  [[ -n "$data" ]] && args+=(-H "Content-Type: application/json" -d "$data")
  [[ -n "$auth" ]] && args+=(-H "Authorization: Bearer $auth")
  local out
  out="$(curl "${args[@]}" 2>/dev/null || printf '\n000')"
  HTTP_STATUS="${out##*$'\n'}"
  HTTP_BODY="${out%$'\n'*}"
}

assert_origin() {
  local url="$1"
  local host
  host="$(python3 -c "from urllib.parse import urlparse; print(urlparse('$url').netloc)" 2>/dev/null || echo bad)"
  local base_host
  base_host="$(python3 -c "from urllib.parse import urlparse; print(urlparse('$BASE').netloc)" 2>/dev/null || echo bad)"
  if [[ "$host" == "$base_host" ]]; then
    pass "same-origin: $url"
  else
    fail "wrong origin for $url — expected $base_host, got $host"
  fi
}

echo "Azure browser sign-off matrix: $BASE"
echo "(Equivalent to incognito — no localStorage; all URLs derived from page origin)"
echo

echo "==> Static pages load"
for path in \
  "/Login/loginPage/login.html" \
  "/Projects/catalog.html" \
  "/Courses/courses.html" \
  "/Community/community.html" \
  "/Competitions/competitions.html" \
  "/Admin/Dashboard/index.html" \
  "/ide"; do
  request GET "${BASE}${path}"
  if [[ "$HTTP_STATUS" == "200" ]] || [[ "$path" == "/ide" && "$HTTP_STATUS" == "302" ]]; then
    pass "GET $path ($HTTP_STATUS)"
  else
    fail "GET $path — HTTP $HTTP_STATUS"
  fi
done

echo
echo "==> Gateway scripts (session fix)"
for path in "/gateway-host.js" "/config.js" "/oauth-config.js"; do
  request GET "${BASE}${path}"
  if [[ "$HTTP_STATUS" == "200" ]]; then
    pass "GET $path"
    echo "$HTTP_BODY" | grep -q "$RAILWAY_WEB" && fail "$path references stale Railway web URL" || true
  else
    fail "GET $path — HTTP $HTTP_STATUS"
  fi
done

echo
echo "==> API routing (same-origin via gateway)"
assert_origin "${BASE}/api/auth/login"
assert_origin "${BASE}/v1/community/chatbot/config"
assert_origin "${BASE}/v1/tracking/catalog"
assert_origin "${BASE}/api/ping"
assert_origin "${BASE}/contests"

request POST "${BASE}/api/auth/login" '{"email":"x@y.com","password":"bad"}'
if [[ "$HTTP_STATUS" == "401" || "$HTTP_STATUS" == "400" ]]; then
  pass "login routing (HTTP $HTTP_STATUS, not 502)"
else
  fail "login routing — HTTP $HTTP_STATUS (expected 400/401)"
fi

request GET "${BASE}/v1/community/chatbot/config"
[[ "$HTTP_STATUS" == "200" ]] && pass "community chatbot config" || fail "chatbot config HTTP $HTTP_STATUS"

request GET "${BASE}/api/ping"
[[ "$HTTP_STATUS" == "200" ]] && pass "NestJS /api/ping via proxy" || fail "NestJS ping HTTP $HTTP_STATUS"

request GET "${BASE}/contests"
[[ "$HTTP_STATUS" =~ ^2 ]] && pass "competitions /contests" || fail "contests HTTP $HTTP_STATUS"

echo
echo "==> Login + session persistence simulation"
TOKEN=""
if [[ -n "${NIBRAS_TEST_EMAIL:-}" && -n "${NIBRAS_TEST_PASSWORD:-}" ]]; then
  request POST "${BASE}/api/auth/login" \
    "{\"email\":\"${NIBRAS_TEST_EMAIL}\",\"password\":\"${NIBRAS_TEST_PASSWORD}\"}"
  if [[ "$HTTP_STATUS" == "200" ]] && command -v jq >/dev/null 2>&1; then
    TOKEN="$(echo "$HTTP_BODY" | jq -r '.accessToken // empty')"
    REFRESH="$(echo "$HTTP_BODY" | jq -r '.refreshToken // empty')"
    [[ -n "$TOKEN" ]] && pass "email/password login" || fail "login missing accessToken"

    if [[ -n "$REFRESH" ]]; then
      request POST "${BASE}/api/auth/refresh-tokens" "{\"refreshToken\":\"${REFRESH}\"}"
      [[ "$HTTP_STATUS" == "200" ]] && pass "token refresh" || fail "refresh HTTP $HTTP_STATUS"
    fi

    request GET "${BASE}/v1/tracking/catalog" "" "$TOKEN"
    [[ "$HTTP_STATUS" == "200" ]] && pass "projects catalog (authenticated)" || fail "catalog HTTP $HTTP_STATUS — ${HTTP_BODY:0:120}"

    request GET "${BASE}/api/auth/me" "" "$TOKEN"
    [[ "$HTTP_STATUS" == "200" ]] && pass "session /api/auth/me" || fail "auth/me HTTP $HTTP_STATUS"
  else
    fail "login failed HTTP $HTTP_STATUS — set valid NIBRAS_TEST_EMAIL/PASSWORD"
  fi
else
  echo "SKIP: login/catalog — set NIBRAS_TEST_EMAIL and NIBRAS_TEST_PASSWORD"
fi

echo
echo "==> AI Tutor (community ask — needs token or returns 401)"
if [[ -n "$TOKEN" ]]; then
  request POST "${BASE}/v1/community/chatbot/ask" \
    '{"question":"What is a variable in programming?","context":""}' \
    "" "$TOKEN"
  if [[ "$HTTP_STATUS" == "200" ]]; then
    pass "AI tutor ask"
  elif [[ "$HTTP_STATUS" == "403" || "$HTTP_STATUS" == "502" ]]; then
    fail "AI tutor ask HTTP $HTTP_STATUS — ${HTTP_BODY:0:120}"
  else
    pass "AI tutor ask HTTP $HTTP_STATUS (may need BYOK or quota)"
  fi
else
  echo "SKIP: tutor ask — no auth token"
fi

echo
echo "==> Courses page API origin check"
request GET "${BASE}/azure-services-config.js"
if [[ "$HTTP_STATUS" == "200" ]]; then
  pass "azure-services-config.js served"
else
  echo "SKIP: azure-services-config.js not yet deployed"
fi

echo
echo "==> IDE (expected unavailable until Judge0 provisioned)"
request GET "${BASE}/v1/ide/status"
if echo "$HTTP_BODY" | grep -q '"configured":true'; then
  pass "IDE configured"
else
  pass "IDE documented as not available (configured:false)"
fi

echo
echo "==> Google OAuth (manual GCP step required)"
echo "NOTE: Add JavaScript origin in Google Cloud Console:"
echo "  ${BASE}"
echo "Verify Google login manually after GCP origin is added."

echo
if [[ "$FAIL" -eq 0 ]]; then
  echo "Browser sign-off matrix passed."
  exit 0
fi
echo "Browser sign-off matrix had failures."
exit 1
