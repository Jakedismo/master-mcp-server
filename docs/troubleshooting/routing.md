---
title: Routing & Modules
---

# Troubleshooting: Routing & Modules

- Missing capabilities: call `discoverAllCapabilities()` after loading servers.
- Unhealthy backend: check health checks and restart via `restartServer(id)`.
- Retry storms: reduce `maxRetries` or increase `baseDelayMs`.
- Circuit breaker open: lower `failureThreshold` or increase recovery timeout.

