---
title: Configuration
---

# Configuration Guide

Centralized configuration with schema validation and secrets.

- Types: `MasterConfig`, `HostingConfig`, `RoutingConfig`, `ServerConfig`, `SecurityConfig`.
- Validation: `SchemaValidator` with built-in default schema.
- Secrets: `SecretManager` decrypts protected values; keys from `SecurityConfig.config_key_env`.
- Environments: `EnvironmentManager` to load/merge env vars.

Commands
- Generate reference from schema: `npm run docs:config`

See: Configuration → Reference for full schema.

