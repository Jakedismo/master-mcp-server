---
title: Common Issues
---

# Troubleshooting: Common Issues

- Invalid configuration: run `npm run docs:config` and compare with schema.
- OAuth callback fails: verify redirect URIs, state/PKCE, and client secrets.
- Workers runtime errors: avoid Node-only APIs; use Web Crypto and Fetch.
- Routing loop or failure: check circuit breaker status and retry limits.
- CORS/Networking: ensure your hosting platform permits required egress.

## FAQ

<details>
<summary>How do I connect a GUI client like Claude Desktop?</summary>

If your version supports remote/HTTP MCP servers, point it at your master base URL and include any required bearer token. Otherwise, run a light stdio→HTTP bridge that forwards MCP requests to the master’s `/mcp/*` endpoints.

</details>

<details>
<summary>Why do I get 401/403 responses?</summary>

The backend server may require a different token than your client token. Configure `delegate_oauth` or `proxy_oauth` on that backend, then complete the OAuth flow via `/oauth/authorize?server_id=<id>`.

</details>

<details>
<summary>Tools or resources are missing in the client.</summary>

Confirm each backend is healthy and exposes capabilities. Check `/capabilities` and `/mcp/tools/list`. Prefix names with the server id (e.g., `serverId.toolName`).

</details>

<details>
<summary>Requests time out under load.</summary>

Tune retries and circuit breaker thresholds in `routing`, and monitor p95/p99 latencies. See Advanced → Performance & Scalability.

</details>

