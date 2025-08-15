# Examples Overview

This directory groups runnable examples demonstrating common scenarios:

- `examples/basic-node` — Minimal Node runtime with a local backend
- `examples/oauth-node` — OAuth delegation using GitHub
- `examples/multi-server` — Multiple instances, load balancing, retries, circuit breaker
- `examples/custom-auth` — Custom `MultiAuthManager` that tweaks backend headers
- `examples/performance` — Tuning routing for throughput and resilience
- `examples/security-hardening` — Production environment configuration tips

Run each by pointing `MASTER_CONFIG_PATH` and using `npm run dev`, unless a custom launcher is provided.

