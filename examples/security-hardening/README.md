# Example: Security Hardening

This example outlines recommended environment and config for production.

## Environment

- `NODE_ENV=production`
- `LOG_FORMAT=json`
- `LOG_LEVEL=info`
- `TOKEN_ENC_KEY` set via secret store
- `MASTER_BASE_URL=https://your.domain`

## Config Snippet

```yaml
security:
  audit: true
logging:
  level: info
hosting:
  platform: node
  port: 3000
```

Deploy with Docker/Koyeb using read-only config mounts and non-root users (see Dockerfiles).

