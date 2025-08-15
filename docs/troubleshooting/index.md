---
title: Common Issues
---

# Troubleshooting: Common Issues

- Invalid configuration: run `npm run docs:config` and compare with schema.
- OAuth callback fails: verify redirect URIs, state/PKCE, and client secrets.
- Workers runtime errors: avoid Node-only APIs; use Web Crypto and Fetch.
- Routing loop or failure: check circuit breaker status and retry limits.
- CORS/Networking: ensure your hosting platform permits required egress.

