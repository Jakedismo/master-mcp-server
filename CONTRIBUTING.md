# Contributing Guide

Thanks for your interest in contributing to the Master MCP Server. This guide outlines the development workflow and standards.

## Development Setup

1) Install Node >= 18.17
2) Install dependencies:

```
npm ci
```

3) Useful scripts:

```
npm run typecheck
npm run build
npm run dev
npm run test
npm run lint && npm run format
```

## Docs & API Reference

- Author guides and tutorials in `docs/`
- Generate API docs (requires network): `npm run docs:api`
- Keep examples in `examples/` runnable and minimal

## Coding Standards

- TypeScript strict mode; no `any` without justification
- Prefer small, composable modules and clear interfaces
- Avoid introducing runtime-only dependencies in shared modules (support both Node and Workers)

## Testing

- Unit tests under `tests/unit` and integration under `tests/integration`
- Add targeted tests for new modules and critical paths

## Commit Style

- Use clear, imperative messages (e.g., "Add OAuth state validation")
- Reference issues where applicable

## Security

- Never commit secrets
- Use `SecretManager` patterns for config secrets

