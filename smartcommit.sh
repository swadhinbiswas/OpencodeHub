#!/usr/bin/env bash

set -euo pipefail

GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

git update-index --refresh >/dev/null 2>&1 || true

FILES=$(git status --porcelain | awk '{print substr($0,4)}')

if [[ -z "$FILES" ]]; then
    echo -e "${GREEN}✓ Nothing to commit.${NC}"
    exit 0
fi

commit_message() {
    local file="$1"
    local emoji=""
    local message=""

    case "$file" in
        *.md)
            emoji="📝"
            message="docs: update $(basename "$file" .md)"
            ;;
        *.css)
            emoji="🎨"
            message="style: improve $(basename "$file")"
            ;;
        *.astro)
            emoji="✨"
            message="feat: update $(basename "$file") page"
            ;;
        *.tsx|*.jsx)
            emoji="✨"
            message="feat: improve $(basename "$file")"
            ;;
        *.ts|*.js)
            emoji="♻️"
            message="refactor: update $(basename "$file")"
            ;;
        *.json|*.yaml|*.yml|*.toml)
            emoji="🔧"
            message="config: update $(basename "$file")"
            ;;
        *.sql)
            emoji="🗄️"
            message="db: update $(basename "$file")"
            ;;
        tests/*|*test*)
            emoji="✅"
            message="test: update $(basename "$file")"
            ;;
        src/db/*)
            emoji="🗄️"
            message="db: update $(basename "$file")"
            ;;
        src/pages/api/*)
            emoji="🚀"
            message="api: update $(basename "$file")"
            ;;
        src/components/*)
            emoji="💄"
            message="ui: improve $(basename "$file")"
            ;;
        docs/*)
            emoji="📝"
            message="docs: add $(basename "$file")"
            ;;
        *)
            emoji="📦"
            message="chore: update $(basename "$file")"
            ;;
    esac

    echo "$emoji $message"
}

echo -e "${BLUE}Found $(echo "$FILES" | wc -l) changed files.${NC}"
echo

while IFS= read -r file
do
    [[ -z "$file" ]] && continue

    if [[ ! -e "$file" ]]; then
        echo -e "${YELLOW}Skipping deleted file: $file${NC}"
        continue
    fi

    echo -e "${BLUE}→ $file${NC}"

    git add "$file"

    msg=$(commit_message "$file")

    if git diff --cached --quiet; then
        echo -e "${YELLOW}No staged changes.${NC}"
        continue
    fi

    if git commit -m "$msg"; then
        echo -e "${GREEN}✓ $msg${NC}"
    else
        echo -e "${RED}✗ Failed: $file${NC}"
        git reset HEAD "$file" >/dev/null 2>&1 || true
    fi

    echo

done <<< "$FILES"

echo -e "${GREEN}🎉 Finished committing all files.${NC}"
