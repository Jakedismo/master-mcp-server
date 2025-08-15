# Environment Variables

Environment variables can override configuration at load time. Key variables:

## Hosting

- `MASTER_HOSTING_PLATFORM` → `hosting.platform`
- `MASTER_HOSTING_PORT` → `hosting.port`
- `MASTER_BASE_URL` → `hosting.base_url`

## Logging

- `MASTER_LOG_LEVEL` → `logging.level`

## Master OAuth

- `MASTER_OAUTH_ISSUER` → `master_oauth.issuer`
- `MASTER_OAUTH_AUTHORIZATION_ENDPOINT` → `master_oauth.authorization_endpoint`
- `MASTER_OAUTH_TOKEN_ENDPOINT` → `master_oauth.token_endpoint`
- `MASTER_OAUTH_JWKS_URI` → `master_oauth.jwks_uri`
- `MASTER_OAUTH_CLIENT_ID` → `master_oauth.client_id`
- `MASTER_OAUTH_CLIENT_SECRET` → `master_oauth.client_secret` (stored as `env:MASTER_OAUTH_CLIENT_SECRET`)
- `MASTER_OAUTH_REDIRECT_URI` → `master_oauth.redirect_uri`
- `MASTER_OAUTH_SCOPES` → comma-separated list → `master_oauth.scopes[]`
- `MASTER_OAUTH_AUDIENCE` → `master_oauth.audience`

## Servers (bulk)

- `MASTER_SERVERS` → JSON array of servers
- `MASTER_SERVERS_YAML` → YAML array of servers

## Config discovery and env

- `MASTER_CONFIG_PATH` → explicit path to YAML/JSON config file
- `MASTER_ENV` / `NODE_ENV` → selects env-specific overrides and affects runtime behavior

## Secrets & Tokens

- `MASTER_CONFIG_KEY` (or `MASTER_SECRET_KEY`) → decrypts `enc:gcm:` config values
- `TOKEN_ENC_KEY` → encrypts stored delegated/proxy tokens (REQUIRED in production)

See `.env.example` for a template.

