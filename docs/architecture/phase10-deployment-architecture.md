# Phase 10 — Deployment Architecture

This document defines the production-ready deployment architecture for the Master MCP Server across Docker, Cloudflare Workers, and Koyeb, including CI/CD, environment and secrets management, and monitoring/HA considerations. It builds on Phases 1–9 (auth, module loading, routing, config management, OAuth flows, utilities, and testing).

## Objectives
- Cross‑platform deployment for Node (Docker/Koyeb) and Workers using a shared codebase.
- Multi-arch container strategy with small, secure images and health checks.
- Workers ESM bundle with runtime-specific adaptations.
- CI/CD that tests, scans, builds, and deploys to all targets.
- Environment and secrets management with platform‑specific guidance.
- Production monitoring, logging, and HA scaling strategy.

---

## Build System Design
- Single codebase targeting two runtimes:
  - Node runtime → `tsconfig.node.json` outputs to `dist/node` (ESM, NodeNext).
  - Workers runtime → `tsconfig.worker.json` outputs to `dist/worker` (ESM, WebWorker libs).
- Entry points:
  - Node: `dist/node/index.js` bootstraps Express server and HTTP endpoints (e.g., `/health`).
  - Workers: `src/runtime/worker.ts` exports `{ fetch(req) { … } }` for Cloudflare.
- Deterministic builds via `npm ci`, TypeScript compile gates (`typecheck`), and linting.
- Artifact separation to keep runtimes decoupled and avoid Node‑only APIs in Workers.

---

## Container Architecture (Docker)
- Multi-stage Dockerfile (builder → runtime) using Node 20 slim.
- Production image contains only `dist/node`, production deps, `config/`, and a tiny entrypoint.
- Non‑root user, read‑only filesystem where possible, pinned NODE_ENV.
- Health check: HTTP GET `GET /health` using a Node-based healthcheck command to avoid extra packages.
- Resource controls via runtime flags and orchestrator level (memory, CPU). Suggested defaults provided below.

Image layout and behavior:
- `ENTRYPOINT` script maps PaaS `PORT` → `MASTER_HOSTING_PORT` automatically when needed.
- Exposes `3000` by default; honors `PORT` when provided (Koyeb/Cloud). Config loader also respects `PORT`.
- Config resolution order: CLI args → env overrides → `config/default.json`/`config/<env>.json` as per Phase 7–8 config subsystem.

Security and size optimizations:
- Only `npm ci --omit=dev` in runtime stage; builder caches deps to speed up builds.
- Drop root privileges, set `NODE_ENV=production`, and default to JSON logs in production.

---

## Cloudflare Workers Architecture
- ESM Worker using `wrangler.toml` with `main = "src/runtime/worker.ts"`.
- Build modes:
  - Local dev/tests: `vitest -c vitest.worker.config.ts` (Miniflare env), or `wrangler dev`.
  - Deploy: `wrangler deploy --env <staging|production>`.
- Workers runtime adaptations already present:
  - Dedicated `src/runtime/worker.ts` to handle OAuth routes and return lightweight responses.
  - Worker build excludes Node-only modules via `tsconfig.worker.json`.
- Environment and secrets via Wrangler:
  - `vars` for non-sensitive configuration (e.g., `MASTER_BASE_URL`, feature flags).
  - `wrangler secret put` for sensitive values (e.g., `TOKEN_ENC_KEY`, OAuth credentials).
- Optional state: If token persistence is required in Workers, integrate KV/Durable Objects via a `TokenStorage` adapter (see Phase 10 notes below) and inject into the auth manager. Until then, tokens are ephemeral across isolates.

---

## Koyeb Deployment Architecture
- Koyeb runs the Docker image. The platform sets `PORT`; the container listens on that port.
- Scaling via Koyeb autoscaler based on CPU/latency; rollouts use rolling updates (min 1 healthy instance).
- Health checks target `/health` with a short interval and small timeout. Failures trigger replacement.
- Environment managed in Koyeb dashboard or `koyeb.yaml` (see deploy/koyeb/koyeb.yaml). Secrets stored as Koyeb Secrets.
- Observability: STDOUT/STDERR logs stream to Koyeb; recommend JSON logs for machine parsing.

---

## CI/CD Pipeline Architecture
- GitHub Actions workflows:
  - `ci.yml` (PRs/push): lint, typecheck, build both targets, run tests (Node + Workers), and basic audit.
  - `deploy.yml` (main/release): build multi‑arch image and push to GHCR; deploy Workers via Wrangler; trigger Koyeb rollout.
- Buildx multi-arch Docker builds: `linux/amd64` and `linux/arm64` using QEMU.
- Security scans: `npm audit` as a baseline (non‑blocking); optional Snyk/CodeQL can be added later.
- Provenance: annotate images with source ref, commit SHA, build timestamp (via labels/metadata action).

---

## Environment & Secrets Management
- Sources of configuration:
  1) CLI args (e.g., `--hosting.port=4000`)
  2) Environment variables (EnvironmentManager maps `MASTER_HOSTING_*` and `PORT`)
  3) Config files `config/default.json` and `config/<env>.json` (validated by JSON schema)
- Minimum required env vars by environment:
  - All: `NODE_ENV`, `LOG_LEVEL`, `LOG_FORMAT` (json|plain), and optional `BASE_URL`/`MASTER_BASE_URL`.
  - OAuth: `TOKEN_ENC_KEY` (required in production; generates ephemeral dev key otherwise).
  - Hosting: `PORT` when provided by PaaS; otherwise `MASTER_HOSTING_PORT` defaults to 3000.
- Secrets handling:
  - Docker: use orchestrator secret stores (Docker/Kubernetes/Compose). Do not bake secrets into image.
  - Workers: use `wrangler secret` for sensitive values; `vars` for non-sensitive.
  - Koyeb: use Koyeb Secrets and environment variables.

Feature flags (examples):
- `FEATURE_METRICS_JSON=true` → expose JSON metrics endpoint (future extension).
- `FEATURE_REQUEST_LOGGING=true` → enrich access logs.

---

## Monitoring & Observability
- Logging:
  - Structured JSON logs by default in production, controlled via `LOG_FORMAT=json` and `LOG_LEVEL`.
  - Include correlation IDs where available; MDC-like `Logger.with({ correlationId })` supported.
- Metrics:
  - Lightweight in-memory counters/gauges/histograms (`src/utils/monitoring.ts`).
  - Node/Docker/Koyeb: expose a `/metrics` JSON endpoint (recommended next step) for scraping or forwarding to Prometheus.
  - Workers: forward summary metrics to analytics/Logs or send to a metrics endpoint if needed.
- Health checks:
  - `GET /health` returns `{ ok: true }`. Add `/ready` if needed to gate traffic during warmup.
- Tracing (optional):
  - Future: integrate OpenTelemetry SDK in Node runtime with OTLP exporter.
  - Workers: best-effort correlation using request IDs; optionally send spans via HTTP to a collector.

---

## High Availability & Scaling
- Edge entry: Cloudflare in front of Docker/Koyeb backends for caching/TLS and geo routing where applicable.
- Koyeb autoscaling: baseline 2 replicas, scale on CPU > 70% or p95 latency. Rolling updates with health checks.
- Workers: global edge deployment, stateless handlers; consider Durable Objects for coordinated state if needed.
- Failure domains:
  - Graceful shutdown on SIGTERM; ephemeral state stored in memory only (OK for stateless operation).
  - Config hot‑reload on file changes (Node only) already present; changes to listening port require restart.
- Disaster recovery: immutable images in GHCR; rollback by redeploying older tag. Workers rollbacks via Wrangler versions.

---

## Platform-Specific Details

### Docker
- Build multi-arch images with Buildx; publish to GHCR.
- Health check calls `/health` every 10s with a 3s timeout.
- Resource guidance per container (starting point): CPU 0.25–1 vCPU, memory 256–512MB.
- Local dev via Compose: bind-mount `config/` and expose port 3000.

### Cloudflare Workers
- `wrangler.toml` defines staging and production environments.
- Provide `MASTER_BASE_URL` (or `BASE_URL`) if OAuth callbacks need stable URLs behind Cloudflare.
- Use `wrangler tail` for logs; consider Workers Analytics Engine for metrics.

### Koyeb
- Deploy the GHCR image; set environment `NODE_ENV=production`, `LOG_FORMAT=json`.
- Koyeb sets `PORT`; the container entrypoint maps `PORT` to config port automatically.
- Autoscaling and min instances defined in `deploy/koyeb/koyeb.yaml`.

---

## Validation & Testing Strategy (Phase 9 Integration)
- Reuse Node test suites via `npm test` and worker tests via `vitest -c vitest.worker.config.ts` in CI.
- Smoke tests run post-deploy:
  - Docker/Koyeb: cURL `/health` and `/capabilities`.
  - Workers: `wrangler deploy --dry-run` + `wrangler tail` checks or synthetic GET `/oauth/authorize` path with required query.
- Security checks: `npm audit` baseline in CI (non-blocking), optional enhancement with Snyk/CodeQL.

---

## Rollout & Release Management
- Version labels embedded in Docker images (`org.opencontainers.image.version`) and exposed via `APP_VERSION` env.
- Environments:
  - `staging`: manual approval before promotion; smaller instance counts.
  - `production`: automatic on tagged releases; blue/green or rolling strategies per platform.

---

## Artifacts Added in Phase 10
- `deploy/docker/Dockerfile` — multi-stage, production‑ready image.
- `deploy/docker/docker-compose.yml` — local dev with hot-reload capability using `npm run dev` image override (optional).
- `deploy/cloudflare/wrangler.toml` — Workers configuration with staging/production envs.
- `deploy/koyeb/koyeb.yaml` — Koyeb service definition with autoscaling and health checks.
- `.github/workflows/ci.yml` and `.github/workflows/deploy.yml` — CI and CD pipelines.
- `.env.example` — environment and secrets reference.
- `deploy/README.md` — usage notes and platform-specific guidance.

This architecture is intentionally conservative: it delivers production‑ready defaults and leaves extensibility hooks (metrics export, KV/DO storage, OpenTelemetry) for incremental adoption.

