# Phase 11: Documentation & Examples Architecture

Goals
- Comprehensive, maintainable documentation with an automated API reference.
- Clear learning paths for multiple personas.
- Realistic examples for Node and Workers.
- Platform-specific deployment docs aligned with Phase 10.
- Configuration reference generated from validation schema.

Structure
- Getting Started — installation, quickstarts, concepts
- API Reference — generated via TypeDoc to Markdown at `/docs/api/reference`
- Guides — task-based docs: authentication, module loading, routing, config, testing
- Deployment — docker, workers, koyeb; references `/deploy/*`
- Configuration — overview, generated reference, environment variables
- Examples — runnable skeletons under `/examples/*`
- Advanced — security, performance, monitoring, extensibility
- Troubleshooting — common issues by area
- Contributing — dev setup and guidelines

Tooling Decisions
- VitePress for docs site: fast, search-enabled, Markdown-first
- TypeDoc + typedoc-plugin-markdown for API Markdown generation
- md-to-pdf for single-file PDF export (optional)

Automation
- `typedoc.json` defines API generation config
- `scripts/generate-config-docs.ts` renders Configuration Reference from the built-in JSON Schema and embeds sample YAMLs
- GitHub workflow `docs.yml` builds API docs, configuration reference, and static site; publishes to Pages

Integration
- Phase 9 Testing: guides and examples point to `/tests` suites and utilities
- Phase 10 Deployment: guides mirror `/deploy/*` assets

User Experience
- Persona-oriented navigation and progressive guides (beginner → advanced)
- Local search powered by VitePress
- Clean URLs and last-updated timestamps

Maintenance
- Add TSDoc comments for new public APIs; re-run `npm run docs:api`
- Update schema or examples; re-run `npm run docs:config`
- Expand examples under `/examples` with a README and link from `/docs/examples`
- Keep `.vitepress/config.ts` nav in sync with new pages

