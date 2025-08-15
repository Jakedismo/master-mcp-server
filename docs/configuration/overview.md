---
title: Configuration Overview
---

# Configuration Overview

The Master MCP configuration is validated against a JSON Schema (`SchemaValidator`).

Key Sections
- `master_oauth`: top-level OAuth issuer/client settings
- `hosting`: platform and runtime options
- `logging`, `security`: operational controls
- `routing`: load balancing, retries, circuit breakers
- `servers[]`: aggregated MCP servers with per-entry config

Start with examples in `/examples/sample-configs/*.yaml`.
Generate the full reference with `npm run docs:config`.

