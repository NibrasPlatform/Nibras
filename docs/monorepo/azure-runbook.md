# Azure production runbook

Deploy and operate the Nibras stack on Azure Container Apps (subscription: Azure for Students, region `uaenorth`, resource group `nibras-rg`).

## Prerequisites

- `az` CLI logged into the correct subscription
- Docker (local builds — ACR cloud build disabled on student subscription)
- Secrets file: `/tmp/nibras-azure-secrets.env` with `DATABASE_URL`, `AUTH_SECRET`, `NIBRAS_ENCRYPTION_KEY`, `OPENAI_API_KEY`

```bash
source /tmp/nibras-azure-secrets.env
```

## Release deploy (unified tag)

```bash
TAG=$(git rev-parse --short HEAD)
BUILD_IMAGES=1 \
  WEB_TAG=$TAG API_TAG=$TAG WORKER_TAG=$TAG BACKEND_TAG=$TAG \
  bash scripts/monorepo/deploy-azure-stack.sh
```

First deploy or empty database — seed course curriculum during deploy:

```bash
source /tmp/nibras-azure-secrets.env
SEED_COURSES=1 BUILD_IMAGES=1 TAG=$(git rev-parse --short HEAD) \
  bash scripts/monorepo/deploy-azure-stack.sh
```

## Course curriculum seeding

Postgres lives on **Railway** (`DATABASE_URL` in secrets). Course content is seeded into Postgres, not the Container Apps filesystem. Run seeds from your **local machine** (the production API image lacks tsx/seed sources).

**One-time or on-demand seed** (no redeploy required):

```bash
source /tmp/nibras-azure-secrets.env
bash scripts/monorepo/seed-azure-courses.sh
```

This runs migrations, base Prisma seed, Years 1–4 curriculum (25 tracking courses + projects), open curricula, community content, and the **Hossam Ahmed veteran demo showcase** (`npm run seed:screenshot`). It restarts `nibras-api` by default so catalog↔tracking links refresh.

**During deploy** — set `SEED_COURSES=1` (see above). Subsequent deploys can omit it; API startup sync keeps curriculum idempotent.

**What runs automatically on API startup:**

- Years 1–4 tracking courses (`syncCurriculumOnStartup`)
- Planner catalog links refreshed after curriculum upsert
- Program catalog, demo users, CP roadmap, community (background sync)
- Open curricula when `NIBRAS_RUNTIME_CURRICULUM_SEED=true` (set on Azure API)
- Demo showcase seed for `demo@nibras.dev` when `NIBRAS_DEMO_SHOWCASE_SEED=true` (set on Azure API)

## Presentation demo user (Hossam Ahmed)

Use this account to demo the product as a student who has been active for 13+ months.

| Field | Value |
|-------|-------|
| Name | Hossam Ahmed |
| Email | `demo@nibras.dev` |
| Password | `local123` |
| Level | Intermediate (Mid Level) |

The showcase seed populates: linked GitHub (`demo-user`), 365-day daily problem history, Nibras 75 + CP Roadmap progress, Year 1/2 enrollments, project submissions, video progress, planner (AI track), badges, and community posts.

**Re-seed demo data only** (curriculum already present):

```bash
source /tmp/nibras-azure-secrets.env
npm run seed:screenshot
# optional: restart API so startup logs confirm showcase seed
az containerapp revision restart -n nibras-api -g nibras-rg --revision "$(az containerapp revision list -n nibras-api -g nibras-rg --query '[0].name' -o tsv)"
```

**Verify login:**

```bash
API_FQDN="$(az containerapp show -n nibras-api -g nibras-rg --query 'properties.configuration.ingress.fqdn' -o tsv)"
curl -sS -X POST "https://${API_FQDN}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@nibras.dev","password":"local123"}'
```

**Verify after seeding:**

```bash
# Course count (requires auth cookie)
curl -sS -b cookies.txt "https://${API_FQDN}/v1/tracking/courses" | jq 'length'
# Expect 25+ active courses

# API logs
az containerapp logs show -n nibras-api -g nibras-rg --tail 50
# Look for "Years 1–4 curricula synced on startup" and "Store seed completed"
```

Rebuild chatbot after API deploy:

```bash
TAG=$TAG bash scripts/monorepo/provision-azure-chatbot.sh
OPENAI_API_KEY='...' bash scripts/monorepo/setup-azure-chatbot-openai.sh
```

## Post-deploy smoke

```bash
NIBRAS_BASE_URL=https://nibras-web.agreeablebush-214764d1.uaenorth.azurecontainerapps.io \
  bash scripts/monorepo/health-check-azure.sh

bash scripts/monorepo/browser-signoff-azure.sh
```

## Email (Resend)

```bash
bash scripts/monorepo/setup-azure-email.sh   # reads RESEND_API_KEY from .env
```

## Google OAuth

```bash
bash scripts/monorepo/setup-azure-google-oauth.sh
```

Add the printed JavaScript origin in Google Cloud Console.

## Judge0 / IDE

```bash
bash scripts/monorepo/provision-azure-judge0-aci.sh
NIBRAS_IDE_CHECK_MODE=azure bash scripts/monorepo/check-ide-deployment.sh
```

## Custom domain

```bash
CF_API_TOKEN=... bash scripts/monorepo/setup-azure-custom-domain.sh
```

## Rollback

```bash
WEB_TAG=<previous> API_TAG=<previous> BUILD_IMAGES=0 \
  DEPLOY_BACKEND=0 DEPLOY_MONGO=0 DEPLOY_REDIS=0 \
  bash scripts/monorepo/deploy-azure-stack.sh
```

## Hybrid dependencies (until migrated)

| Service | Current host |
|---------|----------------|
| Postgres | Railway public proxy |
| Courses API | `nibras-backend.up.railway.app` |
| Recommendation | `recommendationmodel-production-c22c.up.railway.app` |

Override via web env: `NIBRAS_COURSES_API_URL`, `NIBRAS_RECOMMENDATION_API_URL`.

## Credential rotation

1. Rotate keys in Resend, OpenAI, GCP OAuth, Railway Postgres
2. Update `/tmp/nibras-azure-secrets.env`
3. Redeploy with `BUILD_IMAGES=0` to refresh secrets only
4. Restart revisions if secrets unchanged in env refs

## Monitoring

```bash
ACTION_GROUP_EMAIL=ops@example.com bash scripts/monorepo/setup-azure-monitoring.sh
```
