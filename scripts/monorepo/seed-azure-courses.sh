#!/usr/bin/env bash
# Seed full course curriculum into the Azure/Railway Postgres database.
#
# Runs locally against DATABASE_URL (not inside Container Apps — production image
# lacks tsx and seed sources).
#
# Usage:
#   source /tmp/nibras-azure-secrets.env
#   bash scripts/monorepo/seed-azure-courses.sh
#
# Options:
#   RESTART_API=1   Restart nibras-api after seeding (default: 1)
#   RG=nibras-rg    Azure resource group for API restart
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SECRETS_FILE="${SECRETS_FILE:-/tmp/nibras-azure-secrets.env}"
RESTART_API="${RESTART_API:-1}"
RG="${RG:-nibras-rg}"

if [[ -f "$SECRETS_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
fi

if [[ "${DATABASE_URL:-}" == *".railway.internal"* ]]; then
  echo "error: DATABASE_URL uses Railway private host — use DATABASE_PUBLIC_URL for Azure." >&2
  exit 1
fi

: "${DATABASE_URL:?DATABASE_URL required — source $SECRETS_FILE first}"

export DATABASE_URL
export DIRECT_DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}"

cd "$ROOT"

echo "==> Applying migrations ..."
npm run db:deploy

echo "==> Running base Prisma seed (users, demo courses, program catalog) ..."
npx prisma db seed

echo "==> Seeding Years 1–4 curriculum + open curricula ..."
npm run seed:curriculum

echo "==> Seeding community content ..."
npm run seed:community

echo "==> Seeding Hossam Ahmed demo showcase (veteran profile) ..."
npm run seed:screenshot

echo "==> Verifying course count ..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.course.count({ where: { isActive: true, deletedAt: null } })
  .then((count) => {
    console.log('Active tracking courses in database:', count);
    if (count < 20) {
      console.warn('warning: expected 25+ curriculum courses — check seed logs');
      process.exitCode = 1;
    }
  })
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.\$disconnect());
"

if [[ "$RESTART_API" == "1" ]] && command -v az >/dev/null 2>&1; then
  if az containerapp show -n nibras-api -g "$RG" >/dev/null 2>&1; then
    echo "==> Restarting nibras-api to refresh catalog links ..."
    REV="$(az containerapp revision list -n nibras-api -g "$RG" --query '[0].name' -o tsv)"
    az containerapp revision restart -n nibras-api -g "$RG" --revision "$REV" -o none
    echo "API revision restarted: $REV"
  else
    echo "note: nibras-api not found in $RG — skip API restart"
  fi
fi

echo ""
echo "Done. Verify with:"
echo "  curl -sS -b cookies.txt \"https://<api-fqdn>/v1/tracking/courses\" | jq 'length'"
