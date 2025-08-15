# Tutorial: OAuth Delegation (GitHub)

Goal: Use delegated OAuth for a backend requiring GitHub OAuth.

## 1) Create a GitHub OAuth App

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/oauth/callback`

Record `Client ID` and `Client Secret`.

## 2) Configuration

`examples/oauth-node/config.yaml` (provided):

```yaml
hosting:
  platform: node
  port: 3000

master_oauth:
  authorization_endpoint: https://example.com/oauth/authorize
  token_endpoint: https://example.com/oauth/token
  client_id: master-mcp
  redirect_uri: http://localhost:3000/oauth/callback
  scopes: [openid]

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
      port: 4100
```

Set environment variable:

```
export GITHUB_CLIENT_SECRET=... # from GitHub app
```

Run with:

```
MASTER_CONFIG_PATH=examples/oauth-node/config.yaml npm run dev
```

## 3) Start the Flow

Navigate to:

```
http://localhost:3000/oauth/authorize?server_id=github-tools
```

Complete the GitHub consent, then you should see a success page. Calls to tools under `github-tools.*` will now include the delegated token.

