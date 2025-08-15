---
title: OAuth Delegation
---

# OAuth Delegation Guide

Enable per-server OAuth by delegating authorization flows.

- Configure `oauth_delegation.enabled: true` and optional `providers` map.
- Implement callback base URL and provider-specific overrides.
- Use `FlowController` with Express or Workers runtime to complete flows.

Security
- Use state and PKCE to prevent CSRF and code interception.
- Restrict allowed redirect URIs.

See: `src/oauth/*` and `examples/oauth-delegation/`.

