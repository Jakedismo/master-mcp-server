# Deployment Overview

Artifacts and configs to deploy the Master MCP Server:

- Docker
  - `deploy/docker/Dockerfile`: multi-stage build for Node runtime.
  - `deploy/docker/docker-compose.yml`: local development runner.
- Cloudflare Workers
  - `deploy/cloudflare/wrangler.toml`: Workers config (staging/production envs).
  - `deploy/cloudflare/README.md`: usage notes.
- Koyeb
  - `deploy/koyeb/koyeb.yaml`: Koyeb service and autoscaling settings.

CI/CD pipelines live in `.github/workflows`. See `docs/architecture/phase10-deployment-architecture.md` for full details.

