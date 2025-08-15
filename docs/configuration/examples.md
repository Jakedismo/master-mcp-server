---
title: Configuration Examples
---

# Configuration Examples

Real-world scenarios to use as starting points.

## Minimal Local Aggregation

```yaml
hosting:
  port: 3000
servers:
  - id: search
    type: local
    auth_strategy: master_oauth
    config: { port: 4100 }
```

## Mixed Auth Strategies (GitHub Delegation)

```yaml
hosting:
  port: 3000
  base_url: https://your.domain
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
routing:
  retry:
    maxRetries: 2
    baseDelayMs: 200
  circuitBreaker:
    failureThreshold: 5
    successThreshold: 2
    recoveryTimeoutMs: 10000
```

## Dockerized Production

```yaml
hosting:
  port: 3000
servers:
  - id: search
    type: local
    auth_strategy: bypass_auth
    config: { url: http://search:4100 }
```

Run with env:

```bash
TOKEN_ENC_KEY=... MASTER_BASE_URL=https://master.example.com docker compose up -d
```

## Multi-tenant (Advanced)

In multi-tenant deployments, use separate configs per tenant and map them under different base URLs or headers. Keep secrets isolated and rotate regularly.

```yaml
# tenant-a.yaml
hosting: { port: 3001 }
servers: [ { id: search, type: local, auth_strategy: master_oauth, config: { port: 4110 } } ]

# tenant-b.yaml
hosting: { port: 3002 }
servers: [ { id: search, type: local, auth_strategy: master_oauth, config: { port: 4120 } } ]
```

