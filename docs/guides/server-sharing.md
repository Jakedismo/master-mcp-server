---
title: Server Sharing
---

# Server Sharing

Expose multiple MCP backends through the master server and share a single, consistent endpoint with your team or applications.

## Add Backends

Backends are defined in your master config under `servers`.

```yaml
servers:
  - id: search
    type: local
    auth_strategy: master_oauth
    config: { port: 4100 }
  - id: github-tools
    type: local
    auth_strategy: delegate_oauth
    auth_config:
      provider: github
      authorization_endpoint: https://github.com/login/oauth/authorize
      token_endpoint: https://github.com/login/oauth/access_token
      client_id: ${GITHUB_CLIENT_ID}
      client_secret: env:GITHUB_CLIENT_SECRET
      scopes: [repo, read:user]
    config: { port: 4010 }
```

Name collisions are avoided by prefixing capabilities with the server id (e.g., `search.query`, `github-tools.repo.read`).

## Auth Strategies per Server

Choose one per server: `master_oauth`, `delegate_oauth`, `proxy_oauth`, `bypass_auth`.

<AuthFlowDemo />

## Share the Endpoint

- Local: `http://localhost:<port>`
- Docker: container port mapped to host
- Workers: public URL from your deployment

Distribute the base URL along with any client token requirements.

## Health Monitoring & Logs

- `GET /health` and `GET /metrics`
- Container logs (Docker/Koyeb) or platform logs (Workers)
- Use `performHealthChecks()` from code if embedding the master as a library

