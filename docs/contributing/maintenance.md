---
title: Maintenance Procedures
---

# Maintenance & Updates

- After adding/changing public APIs: update TSDoc and run `npm run docs:api`.
- After changing config schema or examples: run `npm run docs:config`.
- Before releases: run `npm run docs:all` and preview with `npm run docs:preview`.
- Keep `.vitepress/config.ts` nav/sidebars in sync with new pages.
- Update examples under `/examples/*` and link from `/docs/examples`.

