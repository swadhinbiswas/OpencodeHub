#!/usr/bin/env bash
set -euo pipefail

CHECKLIST_FILE="${1:-github-issues-checklist.md}"
MODE="${2:-dry-run}" # dry-run | execute

if [[ ! -f "$CHECKLIST_FILE" ]]; then
  echo "Checklist file not found: $CHECKLIST_FILE" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is not installed. Install it first, then rerun." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

# Extract repo from git remote (owner/repo)
REMOTE_URL="$(git remote get-url origin)"
if [[ "$REMOTE_URL" =~ github.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
  OWNER="${BASH_REMATCH[1]}"
  REPO="${BASH_REMATCH[2]}"
  REPO_SLUG="$OWNER/$REPO"
else
  echo "Could not parse GitHub repo from origin remote: $REMOTE_URL" >&2
  exit 1
fi

echo "Repo: $REPO_SLUG"
echo "Mode: $MODE"

mapfile -t ISSUE_LINES < <(grep -E '^- \[ \] G[0-9]{3} \|' "$CHECKLIST_FILE")
if [[ ${#ISSUE_LINES[@]} -eq 0 ]]; then
  echo "No issue lines found in $CHECKLIST_FILE" >&2
  exit 1
fi

created=0
skipped=0

for line in "${ISSUE_LINES[@]}"; do
  IFS='|' read -r col1 col2 col3 col4 col5 col6 <<< "$line"

  gap_id="$(echo "$col1" | sed -E 's/^-[[:space:]]\[[[:space:]]\][[:space:]]*(G[0-9]{3}).*/\1/' | xargs)"
  title_core="$(echo "$col2" | xargs)"
  ws="$(echo "$col3" | sed -E 's/^[[:space:]]*WS:[[:space:]]*`([^`]+)`.*/\1/' | xargs)"
  phase="$(echo "$col4" | sed -E 's/^[[:space:]]*Phase:[[:space:]]*`([^`]+)`.*/\1/' | xargs)"
  priority="$(echo "$col5" | sed -E 's/^[[:space:]]*Priority:[[:space:]]*`([^`]+)`.*/\1/' | xargs)"
  labels="$(echo "$col6" | sed -E 's/^[[:space:]]*Labels:[[:space:]]*`([^`]+)`.*/\1/' | xargs)"

  issue_title="$gap_id $title_core"

  # Skip if already exists by exact title
  if gh issue list --repo "$REPO_SLUG" --search "\"$issue_title\" in:title" --limit 1 --json title | grep -q "$issue_title"; then
    echo "[skip] $issue_title"
    skipped=$((skipped+1))
    continue
  fi

  issue_body=$(cat <<BODY
Roadmap gap from \\`github-issues-checklist.md\\`.

- Gap ID: \\`$gap_id\\`
- Workstream: \\`$ws\\`
- Phase: \\`$phase\\`
- Priority: \\`$priority\\`
- Suggested labels: \\`$labels\\`

## Scope
- Backend/API changes
- UI/UX changes
- Data model/migrations (if needed)
- Docs updates in both trees:
  - \\`docs/\\`
  - \\`docs-site/src/content/docs/\\`

## Acceptance Criteria
- [ ] Feature behavior complete
- [ ] Authorization/security checks in place
- [ ] Unit/integration/e2e tests added
- [ ] \\`npm run lint\\`, \\`npm run typecheck\\`, and tests pass
- [ ] Documentation updated in both doc trees
- [ ] Linked in roadmap tracker
BODY
)

  if [[ "$MODE" == "execute" ]]; then
    gh issue create --repo "$REPO_SLUG" --title "$issue_title" --body "$issue_body" >/dev/null
    echo "[create] $issue_title"
    created=$((created+1))
  else
    echo "[dry-run] $issue_title"
  fi

done

echo
echo "Done. Created: $created | Skipped existing: $skipped | Total lines: ${#ISSUE_LINES[@]}"
if [[ "$MODE" != "execute" ]]; then
  echo "Run with execute mode:"
  echo "  scripts/create_github_issues_from_checklist.sh github-issues-checklist.md execute"
fi
