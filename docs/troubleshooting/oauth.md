---
title: OAuth & Tokens
---

# Troubleshooting: OAuth & Tokens

- Symptom: `invalid_grant` — Check code exchange timing and redirect URI match.
- Symptom: `invalid_client` — Verify client_id/secret; rotate if leaked.
- Symptom: missing `Authorization` — Ensure client token is passed to router/handler.
- Symptom: provider callback 404 — Mount `OAuthFlowController` endpoints.

Logs
- Increase log level to `debug` to see flow details.

