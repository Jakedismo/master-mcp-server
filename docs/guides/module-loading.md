# Module Loading & Capability Aggregation

Master MCP loads backend servers from multiple sources and aggregates their capabilities.

## Sources

- `local`: A locally running server exposing HTTP endpoints
- `git`, `npm`, `pypi`, `docker`: Stubs for different origins; endpoint resolution is config-driven (e.g., `config.port` or `url`).

Example server block:

```yaml
servers:
  - id: search
    type: local
    auth_strategy: master_oauth
    config:
      port: 4100
```

## Health Checks

`DefaultModuleLoader` pings each server’s `/health` endpoint when loading to set an initial status (`running` or `error`).

## Capability Aggregation

`CapabilityAggregator` discovers tools and resources via:

- `GET /capabilities` (optional if provided by backend)
- `POST /mcp/tools/list`
- `POST /mcp/resources/list`

Capabilities can be prefixed by server id (default) to avoid naming conflicts. Use the aggregated names in requests, e.g., `serverId.toolName`.

