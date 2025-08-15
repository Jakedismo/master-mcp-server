# Tutorial: Cloudflare Workers

Run Master MCP Server on Cloudflare Workers with the provided runtime.

## 1) Prerequisites

- Cloudflare account
- `wrangler` CLI

## 2) Configure

Update `deploy/cloudflare/wrangler.toml` as needed. Secrets:

```
wrangler secret put TOKEN_ENC_KEY
```

If you need persistent token storage, bind a KV namespace named `TOKENS` and pass it via environment bindings.

## 3) Dev

```
wrangler dev
```

## 4) Deploy

```
wrangler deploy --env staging
wrangler deploy --env production
```

Ensure `hosting.platform` resolves to `cloudflare-workers` (detected automatically) and that `hosting.base_url` is set appropriately if you rely on absolute redirects for OAuth.

