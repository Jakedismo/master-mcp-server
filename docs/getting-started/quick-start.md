---
title: Quick Start
---

# Quick Start

Get from zero to a running Master MCP Server in under 10 minutes.

<CodeTabs
  :options="[
    { label: 'Node.js', value: 'node' },
    { label: 'Docker', value: 'docker' },
    { label: 'Cloudflare Workers', value: 'workers' }
  ]"
  note="Follow one tab end-to-end."
>
  <template #node>

```bash
npm install
cp .env.example .env
npm run build && npm run start
```

Minimal `config/master.yaml`:

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

Verify:

```bash
curl -s http://localhost:3000/health
curl -s http://localhost:3000/mcp/tools/list | jq
```

  </template>
  <template #docker>

```bash
docker compose up --build
```

Production image:

```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e TOKEN_ENC_KEY=... \
  ghcr.io/OWNER/REPO:latest
```

  </template>
  <template #workers>

```bash
npm run build:worker
npx wrangler deploy deploy/cloudflare
```

  </template>
</CodeTabs>

## Generate a Config

<ConfigGenerator />

## Test Requests

<ApiPlayground />

