# Deploy on Koyeb

Use the CI-built image and the service manifest in `deploy/koyeb/koyeb.yaml`.

## Steps

1) Build and push an image to GHCR or Docker Hub
2) In Koyeb, create a new service from container image
3) Set environment variables and secrets:
   - `NODE_ENV=production`
   - `TOKEN_ENC_KEY` (secret)
   - `MASTER_BASE_URL` set to your Koyeb app URL
4) Configure autoscaling (see example manifest)

The platform-provided `PORT` is mapped automatically to `MASTER_HOSTING_PORT` by `deploy/docker/entrypoint.sh`.

