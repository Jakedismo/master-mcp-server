# Getting Started

This guide walks you through running Master MCP Server locally, configuring backends, and discovering capabilities.

## Prerequisites

- Node.js >= 18.17
- npm
- Network access to install dependencies and reach your OAuth providers/backends

## Install

```
npm ci
```

## Configure

1) Copy env template and edit as needed:

```
cp .env.example .env
```

2) Put your configuration in `config/` or pass a YAML/JSON path via `MASTER_CONFIG_PATH`. The built-in schema lives in `config/schema.json` and is also embedded as a fallback.

Example minimal YAML (single local server):

```yaml
hosting:
  platform: node
  port: 3000

master_oauth:
  authorization_endpoint: https://example.com/oauth/authorize
  token_endpoint: https://example.com/oauth/token
  client_id: master-mcp
  redirect_uri: http://localhost:3000/oauth/callback
  scopes: [openid]

servers:
  - id: tools
    type: local
    auth_strategy: bypass_auth
    config:
      port: 3333
```

## Run Dev Server

```
npm run dev
```

If your config is outside `config/`, set:

```
MASTER_CONFIG_PATH=examples/sample-configs/basic.yaml npm run dev
```

## Verify

- `GET http://localhost:3000/health` → `{ ok: true }`
- `POST http://localhost:3000/mcp/tools/list`
- `POST http://localhost:3000/mcp/resources/list`

When calling tools/resources on protected backends, include `Authorization: Bearer <token>`.

## Next Steps

- Read `docs/guides/authentication.md` for OAuth flows
- See `examples/*` to run end-to-end scenarios
- Deploy using `docs/deployment/*`

