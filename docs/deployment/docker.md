# Deploy with Docker

Two Docker setups are provided:

1) Top-level `Dockerfile` (multi-stage) and `docker-compose.yml` for local dev
2) `deploy/docker/Dockerfile` optimized for CI-built images and Koyeb

## Local Development

```
docker compose up --build
```

This uses the dev target with hot reload (`nodemon`) and maps your working directory into the container.

## Production Image (CI)

Build and push an image:

```
docker build -f deploy/docker/Dockerfile -t ghcr.io/OWNER/REPO:latest .
docker push ghcr.io/OWNER/REPO:latest
```

Run:

```
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e TOKEN_ENC_KEY=... \
  -e MASTER_BASE_URL=https://your.domain \
  ghcr.io/OWNER/REPO:latest
```

## Environment

- Set `TOKEN_ENC_KEY` in production
- Set `MASTER_BASE_URL` if serving behind a proxy to ensure correct OAuth redirects
- Inject `MASTER_OAUTH_CLIENT_SECRET` and other provider secrets via env

