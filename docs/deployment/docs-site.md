---
title: Deploy the Docs Site
---

# Deploy the Docs Site

The documentation is built with VitePress and lives under `docs/`.

## Build Locally

```bash
npm run docs:build
```

The static site is emitted to `docs/.vitepress/dist`.

## Preview Locally

```bash
npm run docs:preview
```

## GitHub Pages

Setup workflow (example):

```yaml
name: Deploy Docs
on:
  push:
    branches: [ main ]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run docs:build
      - uses: actions/upload-pages-artifact@v3
        with: { path: docs/.vitepress/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

## Cloudflare Pages

- Framework preset: None
- Build command: `npm run docs:build`
- Build output directory: `docs/.vitepress/dist`

## Netlify

- Build command: `npm run docs:build`
- Publish directory: `docs/.vitepress/dist`

