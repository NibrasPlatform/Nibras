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
