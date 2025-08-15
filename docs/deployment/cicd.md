# CI/CD Pipelines

Below are example steps you can adapt for your CI provider.

## Build & Publish Docker Image (GitHub Actions)

```yaml
name: build-and-push
on:
  push:
    branches: [ main ]

jobs:
  docker:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build
        run: |
          docker build -f deploy/docker/Dockerfile -t ghcr.io/${{ github.repository }}:latest .
      - name: Push
        run: docker push ghcr.io/${{ github.repository }}:latest
```

## Deploy to Cloudflare Workers (GitHub Actions)

```yaml
name: deploy-workers
on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy --env production
```

## Deploy to Koyeb (CLI from CI)

Use Koyeb’s GitHub Action or the CLI with an API token to update the service image tag after push to GHCR.

