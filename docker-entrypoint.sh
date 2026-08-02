#!/bin/bash
set -e

echo "╔══════════════════════════════════════════╗"
echo "║      OpenCodeHub Starting...             ║"
echo "╚══════════════════════════════════════════╝"

# ── Process type ──────────────────────────────────────────────
#   app    (default) — web UI + API + Git HTTP
#   ssh    — SSH git server (scripts/ssh-server.ts)
#   worker — background jobs (scripts/worker.ts)
PROCESS_TYPE="${PROCESS_TYPE:-app}"

# ── Create required directories ──────────────────────────────
mkdir -p "${GIT_REPOS_PATH:-/data/repos}" "${STORAGE_PATH:-/data/storage}" "${CACHE_PATH:-/data/cache}"
mkdir -p "$(dirname "${LOG_FILE:-/data/logs/opencodehub.log}")"
mkdir -p "${SSH_PATH:-/data/ssh}"

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

  # Run database migrations (deterministic — applies committed migrations in drizzle/)
  echo "🔄 Running database migrations..."
  cd /app
  if [ -d "/app/drizzle" ]; then
    bun scripts/migrate.ts
  else
    echo "⚠️  No drizzle/ migrations found — skipping (use 'npm run db:push' in dev)"
  fi
  echo "✅ Migrations complete"
fi

# ── Initialize SSH host key ──────────────────────────────────
HOST_KEY="${GIT_SSH_HOST_KEY:-${SSH_HOST_KEY_PATH:-/data/ssh/host_key}}"
if [ -n "$HOST_KEY" ] && [ ! -f "$HOST_KEY" ]; then
  echo "🔑 Generating SSH host key..."
  mkdir -p "$(dirname "$HOST_KEY")"
  ssh-keygen -t ed25519 -f "$HOST_KEY" -N "" -q
  echo "✅ SSH host key generated"
fi

# ── Start the requested process ──────────────────────────────
cd /app
case "$PROCESS_TYPE" in
  ssh)
    echo "🚀 Starting OpenCodeHub SSH Git server on port ${GIT_SSH_PORT:-2222}..."
    exec bun scripts/ssh-server.ts
    ;;
  worker)
    echo "🚀 Starting OpenCodeHub background worker..."
    exec bun scripts/worker.ts
    ;;
  *)
    echo "🚀 Starting OpenCodeHub on port ${PORT:-4321}..."
    exec bun ./dist/server/entry.mjs
    ;;
esac
