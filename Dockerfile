# ── Stage 1: Base Environment ──────────────────────────────────
FROM oven/bun:1-slim AS base
WORKDIR /app

LABEL org.opencontainers.image.title="OpenCodeHub" \
      org.opencontainers.image.description="A modern, self-hosted Git platform with stacked PRs, merge queue, CI/CD, and AI review." \
      org.opencontainers.image.url="https://github.com/swadhinbiswas/OpencodeHub" \
      org.opencontainers.image.source="https://github.com/swadhinbiswas/OpencodeHub" \
      org.opencontainers.image.licenses="MIT"

# ── Stage 2: Dependencies (All Dev + Prod for build) ───────────
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY cli/package.json ./cli/package.json
RUN bun install --frozen-lockfile

# ── Stage 3: Production Dependencies Only ──────────────────────
FROM base AS prod-deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY cli/package.json ./cli/package.json
RUN bun install --frozen-lockfile --production \
    && find /app/node_modules -type d \( -name "test" -o -name "tests" -o -name "docs" -o -name "example" -o -name "examples" \) -prune -exec rm -rf {} + 2>/dev/null || true \
    && find /app/node_modules -type f \( -name "*.map" -o -name "*.md" -o -name "*.markdown" \) -delete 2>/dev/null || true

# ── Stage 4: Builder ───────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json astro.config.mjs tailwind.config.mjs postcss.config.mjs drizzle.config.ts docker-entrypoint.sh ./
COPY public ./public
COPY src ./src
COPY cli ./cli
COPY drizzle ./drizzle
COPY scripts ./scripts

ENV NODE_ENV=production
ENV SKIP_REDIS_CHECK=1
RUN bun run build

# ── Stage 5: Production Runner (Lean & Minimal) ────────────────
FROM oven/bun:1-slim AS runner
WORKDIR /app

# Install minimal runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    bash \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Create persistent storage directories
RUN mkdir -p /data/repos /data/repositories /data/storage /data/cache /data/ssh /data/logs && \
    chown -R bun:bun /data /app

# Copy runtime assets
COPY --from=builder --chown=bun:bun /app/dist ./dist
COPY --from=prod-deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/package.json ./
COPY --from=builder --chown=bun:bun /app/drizzle.config.ts ./
COPY --from=builder --chown=bun:bun /app/drizzle ./drizzle
COPY --from=builder --chown=bun:bun /app/src ./src
COPY --from=builder --chown=bun:bun /app/tsconfig.json ./
COPY --from=builder --chown=bun:bun /app/scripts ./scripts
COPY --from=builder --chown=bun:bun /app/docker-entrypoint.sh ./

# Environment defaults
ENV HOST=0.0.0.0
ENV PORT=4321
ENV DATA_DIR=/data
ENV GIT_REPOS_PATH=/data/repositories
ENV STORAGE_PATH=/data/storage
ENV CACHE_PATH=/data/cache
ENV SSH_PATH=/data/ssh
ENV NODE_ENV=production

EXPOSE 4321 2222
USER bun

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4321/api/health || exit 1

ENTRYPOINT ["bash", "./docker-entrypoint.sh"]
