---
title: Environment Variables
---

# Environment Variables

Common variables
- `NODE_ENV`: `development` | `production`
- `PORT`: overrides `hosting.port`
- OAuth secrets: `MASTER_OAUTH_CLIENT_SECRET`, provider secrets
- Encryption: key name from `security.config_key_env`

Use `.env` for local development and set secrets via platform secrets in production.

