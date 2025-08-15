# Authentication Guide

Master MCP Server supports multiple authentication strategies between the client (master) and each backend server.

## Strategies

- master_oauth: Pass the client token from the master directly to the backend.
- delegate_oauth: Instruct the client to complete an OAuth flow against the backend provider, then store a backend token.
- proxy_oauth: Use the master to refresh and proxy backend tokens, falling back to pass-through.
- bypass_auth: No auth headers are sent to the backend.

Configure per-server via `servers[].auth_strategy` and optional `servers[].auth_config`.

<AuthFlowDemo />

<CodeTabs :options="[
  { label: 'master_oauth', value: 'master' },
  { label: 'delegate_oauth', value: 'delegate' },
  { label: 'proxy_oauth', value: 'proxy' },
  { label: 'bypass_auth', value: 'bypass' }
]">
  <template #master>

```yaml
servers:
  - id: search
    type: local
    auth_strategy: master_oauth
    config: { port: 4100 }
```

  </template>
  <template #delegate>

```yaml
servers:
  - id: github-tools
    type: local
    auth_strategy: delegate_oauth
    auth_config:
      provider: github
      authorization_endpoint: https://github.com/login/oauth/authorize
      token_endpoint: https://github.com/login/oauth/access_token
      client_id: ${GITHUB_CLIENT_ID}
      client_secret: env:GITHUB_CLIENT_SECRET
      scopes: [repo, read:user]
    config: { port: 4010 }
```

  </template>
  <template #proxy>

```yaml
servers:
  - id: internal
    type: local
    auth_strategy: proxy_oauth
    auth_config:
      token_source: env:INTERNAL_BACKEND_TOKEN
    config: { port: 4200 }
```

  </template>
  <template #bypass>

```yaml
servers:
  - id: public
    type: local
    auth_strategy: bypass_auth
    config: { port: 4300 }
```

  </template>
</CodeTabs>

```yaml
servers:
  - id: github-tools
    type: local
    auth_strategy: delegate_oauth
    auth_config:
      provider: github
      authorization_endpoint: https://github.com/login/oauth/authorize
      token_endpoint: https://github.com/login/oauth/access_token
      client_id: ${GITHUB_CLIENT_ID}
      client_secret: env:GITHUB_CLIENT_SECRET
      scopes: [repo, read:user]
    config:
      port: 4010
```

## Flow Overview

1) Client calls a tool/resource via master with `Authorization: Bearer <client_token>`.
2) Master determines server strategy via `MultiAuthManager`.
3) If delegation is required, master responds with `{ type: 'oauth_delegation', ... }` metadata.
4) Client opens `GET /oauth/authorize?server_id=<id>` to initiate the auth code + PKCE flow.
5) Redirect back to `GET /oauth/callback` stores the backend token (associated with client token + server id).
6) Retries to the backend now include `Authorization: Bearer <server_token>` as needed.

## Endpoints

- `GET /oauth/authorize` → Starts flow; query: `server_id`, optional `provider` if preconfigured.
- `GET /oauth/callback` → Exchanges code for token and stores it.
- `GET /oauth/success` + `GET /oauth/error` → Result pages.

These are mounted automatically in the Node runtime (`src/index.ts`) and can be used in Workers via `OAuthFlowController.handleRequest()`.

## Customizing Auth

Attach a custom `MultiAuthManager` instance to the `MasterServer`:

```ts
import { MasterServer } from '../src/server/master-server'
import { MultiAuthManager } from '../src/auth/multi-auth-manager'

const master = new MasterServer()
const auth = new MultiAuthManager(config.master_oauth)
auth.registerServerAuth('github-tools', 'delegate_oauth', {/* provider config */})
master.attachAuthManager(auth)
```

See `examples/custom-auth` for a working example.
