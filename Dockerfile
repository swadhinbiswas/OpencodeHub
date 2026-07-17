FROM oven/bun:1 AS base
WORKDIR /app
LABEL org.opencontainers.image.title="OpenCodeHub" \
      org.opencontainers.image.description="A modern, self-hosted Git platform with stacked PRs, merge queue, CI/CD, and AI review." \
      org.opencontainers.image.url="https://github.com/swadhinbiswas/OpencodeHub" \
      org.opencontainers.image.source="https://github.com/swadhinbiswas/OpencodeHub" \
      org.opencontainers.image.licenses="MIT"

# Install ALL dependencies (needed for build including CSS tooling)
FROM base AS deps
RUN apt-get update && apt-get install -y python3 make g++ gcc libc6-dev && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
COPY cli/package.json ./cli/package.json
RUN for i in 1 2 3; do \
      bun install --frozen-lockfile && break || \
      (echo "bun install attempt $i failed, retrying in 10s..." && sleep 10); \
    done

# Install production dependencies only (for runtime image)
FROM base AS prod-deps
RUN apt-get update && apt-get install -y python3 make g++ gcc libc6-dev && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
COPY cli/package.json ./cli/package.json
RUN bun install --frozen-lockfile --production

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV SKIP_REDIS_CHECK=1
RUN bun run build

# Production image
FROM oven/bun:1-slim AS runner
WORKDIR /app

# Install git, ssh, and bash (needed for git operations and entrypoint)
RUN apt-get update && apt-get install -y --no-install-recommends git openssh-client bash && \
    rm -rf /var/lib/apt/lists/*

# Create data directories
RUN mkdir -p /data/repositories /data/storage /data/cache /data/ssh && \
    chown -R bun:bun /data

# Copy only what's needed for runtime
COPY --from=builder --chown=bun:bun /app/dist ./dist
COPY --from=prod-deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/package.json ./

# Copy drizzle config and schema for migrations
COPY --from=builder --chown=bun:bun /app/drizzle.config.ts ./
COPY --from=builder --chown=bun:bun /app/src/db ./src/db
COPY --from=builder --chown=bun:bun /app/tsconfig.json ./

# Copy entrypoint script
COPY --chown=bun:bun docker-entrypoint.sh ./

# Set environment variables
ENV HOST=0.0.0.0
ENV PORT=4321
ENV DATA_DIR=/data
ENV GIT_REPOS_PATH=/data/repositories
ENV STORAGE_PATH=/data/storage
ENV CACHE_PATH=/data/cache
ENV SSH_PATH=/data/ssh
ENV NODE_ENV=production

# Expose ports
EXPOSE 4321

# Switch to non-root user
USER bun

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4321/api/health || exit 1

# Start the application with entrypoint
ENTRYPOINT ["bash", "./docker-entrypoint.sh"]
