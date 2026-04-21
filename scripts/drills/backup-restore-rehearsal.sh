#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/test-results/drills}"
mkdir -p "$OUT_DIR"

echo "[backup-restore-drill] Running backup..."
cd "$ROOT_DIR"
bunx tsx scripts/backup.ts | tee "$OUT_DIR/backup-drill.log"

LATEST_BACKUP="$(ls -1t backups/backup-*.tar.gz backups/backup-*.tar.gz.enc 2>/dev/null | head -n1 || true)"
if [[ -z "$LATEST_BACKUP" ]]; then
  echo "[backup-restore-drill] No backup artifact found after backup run."
  exit 1
fi

echo "[backup-restore-drill] Verifying backup artifact: $LATEST_BACKUP"
bunx tsx scripts/backup-verify.ts "$LATEST_BACKUP" | tee "$OUT_DIR/backup-verify-drill.log"

RESTORE_MODE="${RESTORE_MODE:-safe}"
if [[ "$RESTORE_MODE" == "full" ]]; then
  echo "[backup-restore-drill] Running FULL restore rehearsal (RESTORE_MODE=full)."
  bunx tsx scripts/restore.ts "$LATEST_BACKUP" | tee "$OUT_DIR/restore-drill.log"
else
  echo "[backup-restore-drill] Running SAFE restore rehearsal (non-destructive)."
  RESTORE_DB=false RESTORE_REPOS=false RESTORE_ENV=false bunx tsx scripts/restore.ts "$LATEST_BACKUP" | tee "$OUT_DIR/restore-drill.log"
fi

echo "[backup-restore-drill] ✅ Drill complete. Artifacts in $OUT_DIR"
