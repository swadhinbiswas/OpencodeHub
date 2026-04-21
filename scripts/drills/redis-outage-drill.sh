#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
APP_URL="${APP_URL:-http://localhost:4321/api/health}"
OUT_DIR="${OUT_DIR:-./test-results/drills}"
mkdir -p "$OUT_DIR"

if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif docker-compose version >/dev/null 2>&1; then
  DC=(docker-compose)
else
  echo "[redis-drill] Docker Compose is required."
  exit 1
fi

echo "[redis-drill] Starting services (postgres, redis, app)..."
"${DC[@]}" -f "$COMPOSE_FILE" up -d postgres redis app

echo "[redis-drill] Capturing baseline health..."
curl -sS "$APP_URL" | tee "$OUT_DIR/redis-drill-baseline-health.json" >/dev/null

echo "[redis-drill] Stopping redis to simulate outage..."
"${DC[@]}" -f "$COMPOSE_FILE" stop redis
sleep 8

echo "[redis-drill] Capturing degraded health..."
curl -sS "$APP_URL" | tee "$OUT_DIR/redis-drill-degraded-health.json" >/dev/null || true

echo "[redis-drill] Bringing redis back..."
"${DC[@]}" -f "$COMPOSE_FILE" start redis
sleep 8

echo "[redis-drill] Capturing recovered health..."
curl -sS "$APP_URL" | tee "$OUT_DIR/redis-drill-recovered-health.json" >/dev/null

echo "[redis-drill] Collecting app logs (last 5m)..."
"${DC[@]}" -f "$COMPOSE_FILE" logs --since 5m app > "$OUT_DIR/redis-drill-app.log" || true

echo "[redis-drill] ✅ Drill complete. Artifacts in $OUT_DIR"
