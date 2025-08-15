# Deploy on Cloudflare Workers

Configuration lives in `deploy/cloudflare/wrangler.toml`.

## Setup

```
wrangler whoami
wrangler login
```

Set secrets:

```
wrangler secret put TOKEN_ENC_KEY
# Optional provider secrets as needed
```

Bind KV for token persistence (optional but recommended):

```
wrangler kv:namespace create TOKENS
# Add binding to wrangler.toml and your environments
```

## Dev and Deploy

```
wrangler dev
wrangler deploy --env staging
wrangler deploy --env production
```

Ensure your config uses `hosting.platform=cloudflare-workers` (auto-detected) and `hosting.base_url` is set for OAuth redirects.

