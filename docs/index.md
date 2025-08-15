---
title: Master MCP Server Documentation
---

# Master MCP Server

Aggregate and orchestrate multiple MCP servers behind a single endpoint with first-class authentication, routing, configuration, and deployment support.

- Phase 1–10 complete: authentication, module loading, routing, config, OAuth, utilities, testing, deployment.
- Phase 11 delivers the full documentation and examples architecture.

Quick Links:
- Getting Started: /getting-started/overview
- API Reference: /api/index
- Configuration Reference: /configuration/overview
- Deployment Guides: /deployment/index
- Examples: /examples/index

## 10‑Minute Quick Start

<img src="/diagrams/architecture.svg" alt="Architecture Diagram" style="width:100%;max-width:760px;border-radius:10px;margin:8px 0" />

<CodeTabs
  :options="[
    { label: 'Node.js', value: 'node' },
    { label: 'Docker', value: 'docker' },
    { label: 'Cloudflare Workers', value: 'workers' }
  ]"
  note="Pick your platform and run the first server in minutes."
>
  <template #node>

```bash
# 1) Install deps
npm install

# 2) Copy example env and adjust
cp .env.example .env

# 3) Build and start (Node)
npm run build && npm run start

# Health check
curl -s http://localhost:3000/health
```

Create a minimal config (config/master.yaml):

```yaml
hosting:
  port: 3000
servers:
  - id: search
    type: local
    auth_strategy: master_oauth
    config:
      port: 4100
```

  </template>
  <template #docker>

```bash
# Compose up (hot reload dev)
docker compose up --build

# Or run a production image
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e TOKEN_ENC_KEY=... \
  ghcr.io/OWNER/REPO:latest
```

Put your YAML config in a mounted volume or bake it into the image.

  </template>
  <template #workers>

```bash
# 1) Build worker bundle
npm run build:worker

# 2) Deploy via Wrangler
npx wrangler deploy deploy/cloudflare
```

Set required env vars in wrangler.toml (see Deployment → Cloudflare Workers).

  </template>
</CodeTabs>

### Generate a Config

<ConfigGenerator />

### Try the HTTP API

<ApiPlayground />
