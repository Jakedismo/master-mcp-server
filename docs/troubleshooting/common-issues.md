# Troubleshooting: Common Issues

## Config validation failed

- Error shows `<path>: <reason>` from `SchemaValidator`
- Verify your file is valid JSON/YAML
- Check required fields under `master_oauth`, `hosting`, `servers`

## Missing TOKEN_ENC_KEY in production

- Set `TOKEN_ENC_KEY` to a strong random string
- In development, an ephemeral key is generated with a warning

## OAuth callback mismatch

- Ensure `master_oauth.redirect_uri` matches your runtime base URL
- If behind a proxy, set `MASTER_BASE_URL` to the external URL

## 401 Unauthorized to backends

- Ensure client token is valid or delegated tokens are stored
- For delegated flows, complete `/oauth/authorize` and `/oauth/callback` first

## Workers runtime odd redirects

- Always set `hosting.base_url` in Workers to generate correct absolute URLs

