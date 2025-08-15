# Example: OAuth Delegation (GitHub)

Demonstrates `delegate_oauth` for a GitHub-protected backend.

## Run

Set secrets:

```
export GITHUB_CLIENT_SECRET=... # from GitHub OAuth app
```

Start:

```
MASTER_CONFIG_PATH=examples/oauth-node/config.yaml npm run dev
```

Then open:

```
http://localhost:3000/oauth/authorize?server_id=github-tools
```

