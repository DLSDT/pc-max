# Game Optimization Hub — API (production image)
# Multi-stage: compile TypeScript + shared packages, then a slim runtime that
# applies migrations and serves the API. Requires a PostgreSQL 16+ instance
# (see infrastructure/docker-compose.yml) and optional Redis for the cache.
#
# Build:  docker build -t goh-api -f apps/api/Dockerfile .
# Run:    docker run --env-file .env -p 4000:4000 goh-api

FROM node:20-alpine AS build
WORKDIR /app
# Install with the workspace lockfile first for layer caching.
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY packages/types/package.json packages/types/package.json

# --ignore-scripts: the root "prepare" script builds the shared packages,
# but their source isn't copied in yet at this point — it's built explicitly
# below once it is.
RUN npm ci --ignore-scripts
# Put the hoisted workspace binaries on PATH explicitly. Whether `tsc` is
# reachable from a workspace script depends on how npm hoists and links bins,
# and that differs between npm versions — npm 9 resolved it, the npm 10 in the
# current node:20-alpine did not, so a from-scratch build failed with
# "sh: tsc: not found" while a cached local layer kept working.
ENV PATH=/app/node_modules/.bin:$PATH
# Compile the shared packages, then the API itself.
COPY packages packages
COPY apps/api apps/api
RUN npm run build -w packages/validation && npm run build -w packages/types && npm run build -w apps/api

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Production dependencies only (workspace symlinks preserved).
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
# npm workspaces nests some deps under the workspace's own node_modules when
# a version conflicts with the hoisted root version (e.g. @fastify/swagger,
# fastify-plugin) — the root node_modules copy above doesn't include these.
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
# Migrations SQL — needed by the startup migration runner.
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
# Local-storage uploads dir (bind a volume in compose for persistence).
RUN mkdir -p /app/uploads
ENV UPLOAD_DIR=/app/uploads
EXPOSE 4000
# Migrations first, then serve. Overridable: CMD ["node","apps/api/dist/index.js"]
CMD ["sh", "-c", "node apps/api/dist/db/migrate.js && node apps/api/dist/index.js"]
