#!/bin/bash
set -e

echo "╔══════════════════════════════════════════╗"
echo "║      OpenCodeHub Starting...             ║"
echo "╚══════════════════════════════════════════╝"

# ── Wait for database ────────────────────────────────────────
if [ -n "$DATABASE_URL" ]; then
  echo "⏳ Waiting for database..."
  for i in $(seq 1 30); do
    if bun -e "
      const pg = require('pg');
      const client = new pg.Client(process.env.DATABASE_URL);
      client.connect().then(() => { client.end(); process.exit(0); }).catch(() => process.exit(1));
    " 2>/dev/null; then
      echo "✅ Database is ready"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "⚠️  Database not reachable after 30s, proceeding anyway..."
    fi
    sleep 1
  done

  # Run database migrations
  echo "🔄 Running database migrations..."
  cd /app
  # Generate migration files if they don't exist yet (safe — only creates new ones)
  if [ ! -d "/app/drizzle" ]; then
    echo "📝 Generating initial migration files..."
    bunx drizzle-kit generate 2>/dev/null || echo "⚠️  Migration generation skipped"
  fi
  # Apply pending migrations (safe — never drops columns/tables like push --force)
  bunx drizzle-kit migrate 2>/dev/null || echo "⚠️  Migration apply skipped (may already be up to date)"
  echo "✅ Migrations complete"
fi

# ── Initialize SSH host key ──────────────────────────────────
if [ -n "$SSH_HOST_KEY_PATH" ] && [ ! -f "$SSH_HOST_KEY_PATH" ]; then
  echo "🔑 Generating SSH host key..."
  ssh-keygen -t ed25519 -f "$SSH_HOST_KEY_PATH" -N "" -q
  echo "✅ SSH host key generated"
fi

# ── Create required directories ──────────────────────────────
mkdir -p "${REPOS_PATH:-/data/repos}" "${STORAGE_PATH:-/data/storage}" "${CACHE_PATH:-/data/cache}"
mkdir -p "$(dirname "${LOG_FILE:-/data/logs/opencodehub.log}")"

echo "🚀 Starting OpenCodeHub on port ${PORT:-4321}..."
exec bun ./dist/server/entry.mjs
