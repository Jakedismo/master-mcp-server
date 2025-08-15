# Security Configuration & Practices

## Secrets in Config

Use either of the following in your config:

- `env:VARNAME` → value is read from `process.env.VARNAME`
- `enc:gcm:<base64>` → value is decrypted using `MASTER_CONFIG_KEY` (or `MASTER_SECRET_KEY`)

`SecretManager` handles both resolving and redacting sensitive values for logs.

## Token Encryption

`TokenManager` encrypts stored delegated/proxy tokens with `TOKEN_ENC_KEY`. In production this must be set; otherwise startup fails. In development, a warning is logged and an ephemeral key is generated.

## OAuth Best Practices

- Always set `hosting.base_url` correctly for accurate redirect URIs behind proxies.
- Use PKCE (enabled by default) and short-lived state tokens.
- Limit scopes in `servers[].auth_config.scopes` to the minimum required.

## Hardening Tips

- Drop container capabilities and run as non-root (see Dockerfiles)
- Use `LOG_FORMAT=json` in production for structured logs
- Ensure secrets are injected via platform secret stores (KMS, Workers Secrets, Koyeb Secrets)
- Enable `security.audit` to log config changes (redacted)

