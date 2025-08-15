# Tutorial: Beginner Setup

Goal: Run Master MCP Server with a single local backend and call a tool.

## 1) Install and Start

```
npm ci
cp .env.example .env
npm run dev
```

## 2) Add a Backend

Create `examples/basic-node/config.yaml` (already provided) and run with:

```
MASTER_CONFIG_PATH=examples/basic-node/config.yaml npm run dev
```

## 3) Verify Health and Capabilities

```
curl http://localhost:3000/health
curl -X POST http://localhost:3000/mcp/tools/list -H 'content-type: application/json' -d '{}'
```

## 4) Call a Tool

```
curl -X POST http://localhost:3000/mcp/tools/call \
  -H 'content-type: application/json' \
  -d '{"name":"tools.echo","arguments":{"text":"hello"}}'
```

Replace `tools.echo` with a tool exposed by your backend.

