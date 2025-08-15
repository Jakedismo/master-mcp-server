# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-slim AS base
ENV PNPM_HOME=/usr/local/share/pnpm \
    NODE_ENV=production \
    APP_HOME=/app
WORKDIR ${APP_HOME}

# ---------- Builder ----------
FROM base AS builder
ENV NODE_ENV=development
SHELL ["/bin/sh", "-lc"]
RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt/lists \
    apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY tsconfig*.json ./
COPY src ./src
COPY config ./config
COPY static ./static
RUN npm run build:node

# ---------- Runtime ----------
FROM base AS runtime
SHELL ["/bin/sh", "-lc"]
# Create non-root user
RUN useradd -r -u 10001 -g root nodejs && mkdir -p /app && chown -R nodejs:root /app

# Only production deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy build artifacts and minimal runtime assets
COPY --from=builder /app/dist/node ./dist/node
COPY --from=builder /app/config ./config
COPY --from=builder /app/static ./static
COPY deploy/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production \
    LOG_FORMAT=json \
    PORT=3000 \
    MASTER_HOSTING_PLATFORM=node

EXPOSE 3000
USER nodejs
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/node/index.js"]

# Healthcheck without adding curl/wget: use Node's http module
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');const p=process.env.PORT||3000;http.get({host:'127.0.0.1',port:p,path:'/health'},r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

