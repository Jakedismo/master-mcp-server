---
title: Testing Strategy
---

# Testing Strategy

Phase 9 established a comprehensive strategy with unit, integration, e2e, perf, and security tests.

- Structure: see `/tests` directories by test type.
- Runtimes: run both Node and Workers (Miniflare) where applicable.
- Utilities: `_utils` helpers for HTTP, logging, and test servers.

Commands
- `npm run test` — run all tests
- `npm run test:unit|integration|e2e|perf|security`

See also: `docs/testing/phase-9-testing-architecture.md`.

