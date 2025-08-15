---
title: API Overview
---

# API Overview

The API reference is generated from TypeScript sources using TypeDoc and the `typedoc-plugin-markdown` plugin.

- Generated docs output: `/api/reference/`
- Generation config: `typedoc.json`
- Command: `npm run docs:api`

Key entry points
- `MasterServer` — main orchestration server
- `ModuleLoader`, `RequestRouter`, `CapabilityAggregator` — module and routing
- `MultiAuthManager`, `TokenManager` — authentication core
- `FlowController` and related OAuth utilities — OAuth flows
- `SchemaValidator`, `ConfigLoader` — configuration

See `/api/reference/` for the full API.

