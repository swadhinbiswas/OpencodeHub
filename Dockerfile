FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
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

# Install git and ssh (needed for git operations)
RUN apt-get update && apt-get install -y git openssh-client && rm -rf /var/lib/apt/lists/*

# Create data directories
RUN mkdir -p /data/repos /data/storage /data/cache /data/ssh && \
    chown -R bun:bun /data

# Copy built application
COPY --from=builder --chown=bun:bun /app/dist ./dist
COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/package.json ./

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

# Start the application
CMD ["bun", "./dist/server/entry.mjs"]
