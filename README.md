# Nibras — Full Service Platform

Collaborative learning, competitive programming, and project-based assessment — unified static frontend, NestJS API, Fastify platform API, and CLI.

[![CI](https://github.com/NibrasPlatform/Nibras/actions/workflows/ci.yml/badge.svg)](https://github.com/NibrasPlatform/Nibras/actions/workflows/ci.yml)

## Architecture

| Component   | Port | Role                                                              |
| ----------- | ---- | ----------------------------------------------------------------- |
| **Gateway** | 8080 | Serves `Frontend/client`, routes `/api` → NestJS, `/v1` → Fastify |
| **NestJS**  | 3000 | Auth bridge, courses, **internal contests** (`/api/contests/*`)   |
| **Fastify** | 4848 | Community, external competitions, projects, CLI, tracking (`/v1/*`) |
| **Worker**  | 9090 | Submission verification, grading jobs                             |
| **CLI**     | —    | `nibras login`, `test`, `submit`                                  |

## Prerequisites

- **Node.js** 20+
- **npm** 10+
- **Docker** and Docker Compose (MongoDB, PostgreSQL, Redis)
- **Python** 3.11+ (optional, for AI tutor)

## Quick start (full local deployment)

```bash
cp .env.example .env
npm ci
npm run dev:full
```

`dev:full` boots Docker infrastructure (Postgres, MongoDB, Redis, AI tutor, Judge0 when available), applies migrations, builds the platform, then starts NestJS, Fastify, worker, and the gateway with hot reload.

Open [http://localhost:8080/Login/loginPage/login.html](http://localhost:8080/Login/loginPage/login.html)

Demo login password: `local123` (see `NIBRAS_DEMO_PASSWORD` in `.env`).

Local level test accounts (password `local123`):

| Email | Level |
|-------|-------|
| `beginner@nibras.dev` | Beginner (1) |
| `demo@nibras.dev` | Hossam Ahmed — Intermediate (2), veteran demo (1+ year of activity) |
| `advanced@nibras.dev` | Advanced (3) |
| `expert@nibras.dev` | Expert (4) |

### Google sign-in (local)

`Error 400: origin_mismatch` means your page origin is not registered for the OAuth client. Fix one of:

1. **Team OAuth client** — In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), open the Nibras Web client and add **Authorized JavaScript origins**:
   - `http://localhost:8080`
   - `http://127.0.0.1:8080`

2. **Your own dev client** — Create an OAuth 2.0 **Web application** client, add the same origins, then set in `.env`:

   ```bash
   NIBRAS_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```

   Restart `npm run dev:full` so the gateway serves `/oauth-config.js` with your client ID.

Until Google OAuth is configured, use email/password login (`demo@nibras.dev` / `local123`).

### Docker (all services in containers)

```bash
cp .env.example .env
docker compose --profile tutor up --build
```

Gateway: [http://localhost:8080](http://localhost:8080)

For containerized tutor talking to containerized API, set in `.env`:

```bash
NIBRAS_TUTOR_API_URL=http://fastify-api:4848/v1/community
NIBRAS_TUTOR_API_ORIGIN=http://fastify-api:4848
```

## Scripts

| Script                      | Description                                  |
| --------------------------- | -------------------------------------------- |
| `npm run dev:full`          | Full local deployment: infra + NestJS + Fastify + worker + gateway + tutor + Judge0 |
| `npm run dev:platform`      | Fastify API, worker, and package watch build |
| `npm run start:dev`         | NestJS API only (port 3000)                  |
| `npm run proxy:dev`         | Gateway only (port 8080)                     |
| `npm run build`             | Compile NestJS backend                       |
| `npm run build:platform`    | Build Fastify API, worker, CLI, packages     |
| `npm run build:all`         | Build platform + NestJS                      |
| `npm run build:cli:package` | Build CLI for local install (`npm link`)     |
| `npm test`                  | NestJS unit tests (Jest)                     |
| `npm run test:platform`     | Monorepo integration tests                   |
| `npm run test:e2e`          | NestJS E2E tests                             |
| `npm run dev:session`       | Create local instructor session token        |
| `npm run smoke:local`       | HTTP smoke test against NestJS API           |
| `npm run smoke:gateway`     | Gateway smoke (community + competitions)     |
| `npm run db:deploy`         | Apply Prisma migrations                      |
| `npm run seed:screenshot`   | Seed Hossam Ahmed veteran demo data for UI/presentations |

## CLI

```bash
npm run build:cli:package
npm link
nibras login
nibras list
nibras test
nibras submit
```

CLI targets the gateway at `http://localhost:8080` by default (`NIBRAS_API_BASE_URL` in `.env`).

## API endpoints

| Endpoint         | Backend | Description                     |
| ---------------- | ------- | ------------------------------- |
| `GET /api/ping`  | NestJS  | Health — MongoDB + Redis        |
| `GET /api/docs`  | NestJS  | Swagger UI                      |
| `GET /v1/health` | Fastify | Platform health                 |
| `GET /docs`      | Fastify | Platform Swagger (when enabled) |

Via gateway:

```bash
curl -s http://localhost:8080/api/ping | jq .
curl -s http://localhost:8080/v1/health | jq .
```

## Environment

Copy [`.env.example`](.env.example) to `.env`. Sections cover NestJS, Fastify/platform, and gateway settings.

Key variables:

- `MONGO_URI`, `REDIS_HOST`, `AUTH_SECRET` — NestJS
- `DATABASE_URL` — PostgreSQL for Fastify/Prisma
- `NIBRAS_STATIC_ROOT=Frontend/client` — static UI root for gateway
- `NIBRAS_NESTJS_ORIGIN`, `NIBRAS_FASTIFY_ORIGIN` — gateway upstreams

## Project layout

```
src/              NestJS backend (auth, courses, internal contests bridge)
Frontend/client/  Static student/instructor dashboard (canonical UI)
apps/
  api/            Fastify platform API
  cli/            @nibras/cli
  worker/         Job processor
  proxy/          Unified gateway
  tutor/          AI tutor (Flask)
packages/         Shared contracts, core, grading, github
prisma/           PostgreSQL schema + seeds
courses/          Sample course assignments
bin/nibras.js     CLI entry point
```

## Bruno API collection

See [`bruno/README.md`](bruno/README.md) for NestJS API testing.

## License

MIT — see [LICENSE](LICENSE).
