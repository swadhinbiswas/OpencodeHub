#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

RANGES=("$@")
if [[ ${#RANGES[@]} -eq 0 ]]; then
  RANGES=("HEAD~20..HEAD")
fi

if [[ "${OCH_SECRET_SCAN_BYPASS:-false}" == "true" ]]; then
  echo "[secret-scan] bypass enabled via OCH_SECRET_SCAN_BYPASS=true"
  exit 0
fi

run_gitleaks_for_range() {
  local range="$1"
  echo "[secret-scan] gitleaks range: $range"
  gitleaks detect \
    --source . \
    --config .gitleaks.toml \
    --no-banner \
    --redact \
    --log-opts "$range" \
    --exit-code 1
}

run_gitleaks_full_repo() {
  echo "[secret-scan] gitleaks full-repo fallback"
  gitleaks detect \
    --source . \
    --config .gitleaks.toml \
    --no-banner \
    --redact \
    --exit-code 1
}

run_heuristic_scan() {
  local range="$1"
  local diff_out
  if ! diff_out="$(git diff "$range" 2>/dev/null || true)"; then
    diff_out=""
  fi

  if [[ -z "$diff_out" ]]; then
    return 0
  fi

  # Lightweight high-risk pattern scan for environments where gitleaks is unavailable.
  if echo "$diff_out" | grep -E -i \
    '(AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----|GOCSPX-[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z\-_]{20,}|glpat-[A-Za-z0-9\-_]{20,}|postgres://[^[:space:]]+:[^[:space:]]+@|mongodb(\+srv)?://[^[:space:]]+:[^[:space:]]+@|redis://[^[:space:]]+:[^[:space:]]+@)' >/dev/null; then
    echo "[secret-scan] possible secret detected in range: $range"
    echo "[secret-scan] install gitleaks for precise scanning: https://github.com/gitleaks/gitleaks"
    return 1
  fi

  return 0
}

main() {
  local has_gitleaks=false
  if command -v gitleaks >/dev/null 2>&1; then
    has_gitleaks=true
  fi

  if [[ "$has_gitleaks" == true ]]; then
    for range in "${RANGES[@]}"; do
      if ! run_gitleaks_for_range "$range"; then
        echo "[secret-scan] blocked push because secret findings were detected."
        echo "[secret-scan] if this is a false positive, use an allowlist rule and re-run scan."
        exit 1
      fi
    done

    echo "[secret-scan] passed (gitleaks)"
    exit 0
  fi

  echo "[secret-scan] gitleaks not found, running heuristic fallback scan"
  for range in "${RANGES[@]}"; do
    if ! run_heuristic_scan "$range"; then
      echo "[secret-scan] blocked push due to high-risk secret pattern(s)."
      exit 1
    fi
  done

  echo "[secret-scan] passed (heuristic fallback)"
}

main
