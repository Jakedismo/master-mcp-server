---
title: Quickstart (Node)
---

# Quickstart (Node)

This minimal example runs Master MCP Server in Node, aggregating two servers.

Steps
1. Create a config file (e.g., `config/master.yaml`) based on `examples/sample-configs/basic.yaml`.
2. Start the server: `npm run start`.
3. Connect your MCP client to the exposed endpoint.

Highlights
- Uses `src/runtime/node.ts` to bootstrap.
- Validates config with `SchemaValidator`.
- Routes requests via `RouteRegistry` and `RequestRouter`.

See also: Examples → Basic Node Aggregator.

