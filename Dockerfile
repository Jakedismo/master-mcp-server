# syntax=docker/dockerfile:1.7

# Multi-stage build for production and dev with multi-arch support.
# Targets:
# - base: common base image
# - deps: install all dependencies (including dev)
# - build: compile TypeScript to dist
# - prod-deps: install only production deps
# - runner: minimal runtime image
# - dev: development image with hot-reload support

ARG NODE_VERSION=20.14.0
ARG ALPINE_VERSION=3.19

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base
ENV NODE_ENV=production \
    APP_HOME=/app \
    PNPM_HOME=/pnpm
WORKDIR ${APP_HOME}
RUN addgroup -g 1001 -S nodejs && adduser -S node -u 1001 -G nodejs

FROM base AS deps
ENV NODE_ENV=development
COPY package*.json ./
# Prefer npm ci for reproducible installs
RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM deps AS build
COPY tsconfig*.json ./
COPY src ./src
COPY config ./config
COPY static ./static
RUN npm run build

FROM deps AS prod-deps
ENV NODE_ENV=production
RUN --mount=type=cache,target=/root/.npm \
    npm prune --omit=dev

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runner
ENV NODE_ENV=production \
    APP_HOME=/app \
    PORT=3000
WORKDIR ${APP_HOME}
# Busybox wget is enough for healthcheck; curl can be used if preferred
RUN apk add --no-cache wget

# Copy built app and production deps
COPY --from=prod-deps ${APP_HOME}/node_modules ./node_modules
COPY --from=build ${APP_HOME}/dist ./dist
COPY package*.json ./
COPY config ./config
COPY static ./static

# Use non-root user
USER 1001

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1

# Default start command
CMD ["node", "dist/node/index.js"]

# Development image with hot reloading (nodemon)
FROM deps AS dev
ENV NODE_ENV=development \
    PORT=3000
RUN npm pkg set scripts.dev:watch="nodemon --watch src --ext ts,tsx,json --exec 'node --loader ts-node/esm src/index.ts'" && \
    npm i -D nodemon@^3
CMD ["npm", "run", "dev:watch"]

