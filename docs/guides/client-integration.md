---
title: Client Integration
---

# Client Integration

Connect your MCP clients to the Master MCP Server and verify end-to-end flows.

> Note: The Master MCP Server exposes HTTP endpoints for tools and resources (e.g., `/mcp/tools/call`). Custom clients can integrate directly over HTTP. For GUI clients like Claude Desktop, support for HTTP/remote servers may vary by version. If direct HTTP is unsupported, consider a small bridge (stdio → HTTP) or use the Node runtime directly inside your app.

## Custom Clients (HTTP)

Use any HTTP-capable client. Examples below:

```bash
curl -s -H 'content-type: application/json' \
  -X POST http://localhost:3000/mcp/tools/list -d '{"type":"list_tools"}'
```

Node (fetch):

```ts
import fetch from 'node-fetch'
const res = await fetch('http://localhost:3000/mcp/tools/call', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer YOUR_CLIENT_TOKEN' },
  body: JSON.stringify({ name: 'search.query', arguments: { q: 'hello' } })
})
console.log(await res.json())
```

See also: Getting Started → Quick Start and the <ApiPlayground /> on the landing page.

## Claude Desktop (Guidance)

Claude Desktop supports MCP servers via configuration. The exact configuration and supported transports can change; consult the latest Claude Desktop documentation.

Two approaches:

- If your Claude Desktop version supports remote/HTTP MCP servers, configure it to point at your master base URL (e.g., `http://localhost:3000`) and include a bearer token if required.
- Otherwise, run a small stdio bridge that speaks MCP to the client and forwards requests to the master HTTP endpoints. The bridge should:
  - Respond to tool/resource listing using the master’s `/mcp/*/list` endpoints
  - Forward tool calls and resource reads to `/mcp/tools/call` and `/mcp/resources/read`
  - Map names like `serverId.toolName` consistently

> Tip: Keep your bridge stateless. Let the master handle routing, retries, and auth strategies.

## Testing Connections

- Health: `GET /health` → `{ ok: true }`
- Capabilities: `GET /capabilities` → aggregated tools/resources
- Tools/Resources: use the POST endpoints under `/mcp/*`

## Troubleshooting

- 401/403: ensure your Authorization header is present and matches backend expectations.
- Missing tools/resources: confirm the backend servers are healthy and listed in config.
- Delegated OAuth required: follow the flow at `/oauth/authorize?server_id=<id>`.

