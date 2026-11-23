# syntax=docker/dockerfile:1

FROM node:22-slim AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci --workspace=@pokeverse/shared --workspace=pokeverse-api --include-workspace-root

COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

RUN npm run build:shared \
  && npx --workspace=pokeverse-api prisma generate \
  && npm run build:api

FROM node:22-slim AS prod-deps

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/prisma/ apps/api/prisma/

RUN npm ci --omit=dev --workspace=@pokeverse/shared --workspace=pokeverse-api --include-workspace-root \
  && npm install --prefix /opt/prisma --no-save prisma@6.19.3 \
  && /opt/prisma/node_modules/.bin/prisma generate --schema=apps/api/prisma/schema.prisma \
  && npm cache clean --force

FROM node:22-slim AS runner

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV API_PORT=3000

WORKDIR /app
RUN chown node:node /app

COPY --chown=node:node --from=prod-deps /app/package.json ./package.json
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --chown=node:node --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --chown=node:node --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --chown=node:node --from=builder /app/apps/api/dist ./apps/api/dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.API_PORT || process.env.PORT || 3000) + '/health/live').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "apps/api/dist/main.js"]
