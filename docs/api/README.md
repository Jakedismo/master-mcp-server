# API Reference

The API reference is generated from source using TypeDoc with the Markdown plugin.

## Generate

1) Install dev dependencies (requires network):

```
npm i -D typedoc typedoc-plugin-markdown
```

2) Generate docs:

```
npm run docs:api
```

This will output Markdown files into `docs/api/`.

## Entrypoints

The TypeDoc configuration is at `typedoc.json` and includes `src/**/*.ts`. Key modules:

- Authentication: `src/auth/*`
- Configuration: `src/config/*`
- OAuth flows: `src/oauth/*`
- Server and routing: `src/server/*`, `src/modules/*`, `src/routing/*`
- Utilities: `src/utils/*`

