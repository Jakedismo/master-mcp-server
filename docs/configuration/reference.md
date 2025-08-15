# Configuration Reference

Configuration can be provided as JSON or YAML. The loader merges:

1) `config/default.json`
2) `config/<env>.json` (`MASTER_ENV` or `NODE_ENV`)
3) Environment overrides
4) CLI overrides
5) Explicit file from `MASTER_CONFIG_PATH`

Validated against `config/schema.json` (or embedded fallback).

## Top-Level Fields

- `master_oauth` (required): OAuth settings for the master/client tokens
  - `authorization_endpoint` (url)
  - `token_endpoint` (url)
  - `client_id` (string)
  - `client_secret` (string | `env:VAR` | `enc:gcm:...`)
  - `redirect_uri` (string)
  - `scopes` (string[])
  - `issuer?` (string)
  - `jwks_uri?` (string)
  - `audience?` (string)
- `hosting` (required)
  - `platform`: `node` | `cloudflare-workers` | `koyeb` | `docker` | `unknown`
  - `port?`: integer (Node only)
  - `base_url?`: used for OAuth redirect URL construction
  - `storage_backend?`: hints (e.g., `kv`, `durable_object`, `fs`)
- `logging`
  - `level`: `debug` | `info` | `warn` | `error`
- `routing`
  - `loadBalancer.strategy`: `round_robin` | `weighted` | `health`
  - `circuitBreaker`: `failureThreshold`, `successThreshold`, `recoveryTimeoutMs`
  - `retry`: `maxRetries`, `baseDelayMs`, `maxDelayMs`, `backoffFactor`, `jitter`, `retryOn.*`
- `security`
  - `config_key_env?`: env var name containing config secret key (defaults to `MASTER_CONFIG_KEY`)
  - `audit?`: enable config change audit logs
  - `rotation_days?`: secret rotation policy hint
- `servers` (required) — array of:
  - `id` (string)
  - `type`: `git` | `npm` | `pypi` | `docker` | `local`
  - `auth_strategy`: `master_oauth` | `delegate_oauth` | `bypass_auth` | `proxy_oauth`
  - `auth_config?`: provider-specific details
  - `config`:
    - `port?` (integer)
    - `environment?` (map)
    - `args?` (string[])

## YAML Example

```yaml
hosting:
  platform: node
  port: 3000

logging:
  level: info

routing:
  loadBalancer: { strategy: round_robin }
  circuitBreaker: { failureThreshold: 5, successThreshold: 2, recoveryTimeoutMs: 30000 }
  retry: { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 4000, backoffFactor: 2, jitter: full }

master_oauth:
  authorization_endpoint: https://example.com/oauth/authorize
  token_endpoint: https://example.com/oauth/token
  client_id: master-mcp
  client_secret: env:MASTER_OAUTH_CLIENT_SECRET
  redirect_uri: http://localhost:3000/oauth/callback
  scopes: [openid]

servers:
  - id: tools
    type: local
    auth_strategy: bypass_auth
    config:
      port: 3333
```

<!-- GENERATED:BEGIN -->

# Configuration Reference

This reference is generated from the built-in JSON Schema used by the server to validate configuration.

## Top-Level Fields

- `master_oauth` (required) — type: object
  - `master_oauth.issuer` — type: string
  - `master_oauth.authorization_endpoint` (required) — type: string, format: url
  - `master_oauth.token_endpoint` (required) — type: string, format: url
  - `master_oauth.jwks_uri` — type: string
  - `master_oauth.client_id` (required) — type: string
  - `master_oauth.client_secret` — type: string
  - `master_oauth.redirect_uri` (required) — type: string
  - `master_oauth.scopes` (required) — type: array
      - items: — type: string
  - `master_oauth.audience` — type: string
- `hosting` (required) — type: object
  - `hosting.platform` (required) — type: string, enum: node, cloudflare-workers, koyeb, docker, unknown
  - `hosting.port` — type: number, format: integer
  - `hosting.base_url` — type: string
- `logging` — type: object
  - `logging.level` — type: string, enum: debug, info, warn, error
- `routing` — type: object
  - `routing.loadBalancer` — type: object
    - `routing.loadBalancer.strategy` — type: string
  - `routing.circuitBreaker` — type: object
  - `routing.retry` — type: object
- `servers` (required) — type: array
    - items: — type: object
      - `servers[].id` (required) — type: string
      - `servers[].type` (required) — type: string, enum: git, npm, pypi, docker, local
      - `servers[].url` — type: string
      - `servers[].package` — type: string
      - `servers[].version` — type: string
      - `servers[].branch` — type: string
      - `servers[].auth_strategy` (required) — type: string, enum: master_oauth, delegate_oauth, bypass_auth, proxy_oauth
      - `servers[].auth_config` — type: object
      - `servers[].config` (required) — type: object
        - `servers[].config.environment` — type: object
        - `servers[].config.args` — type: array
            - items: — type: string
        - `servers[].config.port` — type: number, format: integer


## Examples

## Example: basic.yaml

```yaml
hosting:
  platform: node
  port: 3000

master_oauth:
  authorization_endpoint: https://example.com/auth
  token_endpoint: https://example.com/token
  client_id: demo-client
  redirect_uri: http://localhost:3000/callback
  scopes:
    - openid

servers:
  - id: example
    type: local
    auth_strategy: master_oauth
    config:
      environment: {}
      args: []
      port: 3333


```

## Example: simple-setup.yaml

```yaml
hosting:
  platform: node
  port: 3000

master_oauth:
  authorization_endpoint: https://auth.example.com/authorize
  token_endpoint: https://auth.example.com/token
  client_id: master-mcp
  redirect_uri: http://localhost:3000/oauth/callback
  scopes: [openid, profile]

servers:
  - id: local-simple
    type: local
    auth_strategy: bypass_auth
    config:
      port: 4001
      environment: {}


```


<!-- GENERATED:END -->