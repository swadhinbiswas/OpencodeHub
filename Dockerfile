FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
RUN apt-get update && apt-get install -y python3 make g++ gcc libc6-dev && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Production image
FROM oven/bun:1 AS runner
WORKDIR /app

# Install git, ssh, and bash (needed for git operations and entrypoint)
RUN apt-get update && apt-get install -y git openssh-client bash && rm -rf /var/lib/apt/lists/*

# Create data directories
RUN mkdir -p /data/repos /data/storage /data/cache /data/ssh && \
    chown -R bun:bun /data

# Copy built application
COPY --from=builder --chown=bun:bun /app/dist ./dist
COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
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
ENV REPOS_PATH=/data/repos
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
