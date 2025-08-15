# Configuration Management

Master MCP Server supports JSON or YAML configuration files, environment variable overrides, CLI overrides, schema validation, and secret resolution.

## Files

- Default paths: `config/default.json`, `config/<env>.json`
- Explicit path: set `MASTER_CONFIG_PATH=/path/to/config.yaml`
- Schema: `config/schema.json` (also embedded in code as a fallback)

## Environment Overrides

Environment variables map to config fields. Key ones:

- `MASTER_HOSTING_PLATFORM`, `MASTER_HOSTING_PORT`, `MASTER_BASE_URL`
- `MASTER_LOG_LEVEL`
- `MASTER_OAUTH_*` (ISSUER, AUTHORIZATION_ENDPOINT, TOKEN_ENDPOINT, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SCOPES, AUDIENCE)
- `MASTER_SERVERS` (JSON) or `MASTER_SERVERS_YAML` (YAML)

See `docs/configuration/environment-variables.md` and `.env.example`.

## CLI Overrides

You can override nested fields with dotted keys:

```
node dist/node/index.js --hosting.port=4000 --routing.retry.maxRetries=3
```

## Secrets

- `env:VARNAME` → replaced by `process.env.VARNAME` at load time
- `enc:gcm:<base64>` → decrypted using `MASTER_CONFIG_KEY` (or `MASTER_SECRET_KEY`)

Use `SecretManager` to encrypt/decrypt/rotate secrets safely.

## Hot Reload (Node)

When `ConfigManager` is created with `{ watch: true }`, changes to `config/default.json`, `config/<env>.json`, or an explicit path will be validated and emitted. Some changes (e.g., hosting.port) still require a restart.

## Validation

Configs are validated using a lightweight schema validator (`SchemaValidator`) with support for types, enums, required fields, arrays, and formats (`url`, `integer`). On failure, the error lists the exact path and reason.

