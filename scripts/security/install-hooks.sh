#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

chmod +x .githooks/pre-push scripts/security/pre-push-secret-scan.sh

git config core.hooksPath .githooks

echo "[hooks] configured core.hooksPath=.githooks"
echo "[hooks] installed pre-push secret scan guard"
