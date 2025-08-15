# Security Best Practices

- Store secrets in environment or platform secret stores; avoid plaintext in config
- Set `TOKEN_ENC_KEY` in production and rotate periodically
- Use minimal OAuth scopes and avoid long-lived tokens when possible
- Prefer `LOG_FORMAT=json` and sanitize logs; `SecretManager.redact` prevents secret leakage in config logs
- Enforce `https` at the edge and set `MASTER_BASE_URL=https://...` to ensure secure redirects

