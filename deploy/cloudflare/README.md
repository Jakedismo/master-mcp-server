# Cloudflare Workers Deployment

## Prerequisites
- Cloudflare account and `CLOUDFLARE_API_TOKEN` with Workers permissions.
- `wrangler` installed locally or use GitHub Action for CI deploys.

## Local Dev
```
wrangler dev
```

## Configure Secrets
```
wrangler secret put TOKEN_ENC_KEY
# Add any OAuth client secrets as needed
```

## Deploy
```
wrangler deploy --env staging
wrangler deploy --env production
```

The worker entry is `src/runtime/worker.ts` which exports a `fetch` handler. Ensure your config values align with Workers (e.g., base URLs for OAuth callbacks).

