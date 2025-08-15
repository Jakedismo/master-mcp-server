---
title: Cloudflare Worker
---

# Example: Cloudflare Worker

Folder: `/examples/cloudflare-worker`

What it shows
- Worker `fetch` handler delegating to runtime adapter
- Using `wrangler.toml` from `/deploy/cloudflare`

Run
1. `npm run build:worker`
2. `npx wrangler dev examples/cloudflare-worker/worker.ts`

