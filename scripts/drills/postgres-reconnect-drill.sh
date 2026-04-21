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
  echo "[postgres-drill] Docker Compose is required."
  exit 1
fi

echo "[postgres-drill] Starting services (postgres, redis, app)..."
"${DC[@]}" -f "$COMPOSE_FILE" up -d postgres redis app

echo "[postgres-drill] Capturing baseline health..."
curl -sS "$APP_URL" | tee "$OUT_DIR/postgres-drill-baseline-health.json" >/dev/null

echo "[postgres-drill] Stopping postgres to simulate DB outage..."
"${DC[@]}" -f "$COMPOSE_FILE" stop postgres
sleep 8

echo "[postgres-drill] Capturing degraded health..."
curl -sS "$APP_URL" | tee "$OUT_DIR/postgres-drill-degraded-health.json" >/dev/null || true

echo "[postgres-drill] Starting postgres again..."
"${DC[@]}" -f "$COMPOSE_FILE" start postgres
sleep 10

echo "[postgres-drill] Capturing recovered health..."
curl -sS "$APP_URL" | tee "$OUT_DIR/postgres-drill-recovered-health.json" >/dev/null

echo "[postgres-drill] Collecting app logs (last 5m)..."
"${DC[@]}" -f "$COMPOSE_FILE" logs --since 5m app > "$OUT_DIR/postgres-drill-app.log" || true

echo "[postgres-drill] ✅ Drill complete. Artifacts in $OUT_DIR"
