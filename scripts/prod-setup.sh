#!/bin/bash
# OpenCodeHub Production Setup Script
# ====================================
# Generates secrets, validates config, and starts the production stack.
#
# Usage:
#   bash scripts/prod-setup.sh              # Interactive setup
#   bash scripts/prod-setup.sh --auto       # Non-interactive (CI/CD)
#   bash scripts/prod-setup.sh --start      # Setup + start
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ENV_FILE=".env"
AUTO_MODE=false
START_AFTER=false

for arg in "$@"; do
  case $arg in
    --auto) AUTO_MODE=true ;;
    --start) START_AFTER=true ;;
  esac
done

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   OpenCodeHub Production Setup            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Generate secrets if .env doesn't exist ────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${YELLOW}No .env found. Generating from .env.example...${NC}"
  cp .env.example .env

  # Generate all required secrets
  JWT_SECRET=$(openssl rand -base64 32)
  SESSION_SECRET=$(openssl rand -base64 32)
  INTERNAL_HOOK_SECRET=$(openssl rand -hex 32)
  CRON_SECRET=$(openssl rand -hex 32)
  AI_CONFIG_ENCRYPTION_KEY=$(openssl rand -hex 32)
  WORKFLOW_SECRET_ENCRYPTION_KEY=$(openssl rand -hex 32)
  RUNNER_SECRET=$(openssl rand -hex 32)
  POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '=' | tr '/+' '_-')
  REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '=' | tr '/+' '_-')

  # Replace placeholder values in .env
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$ENV_FILE"
  sed -i "s|SESSION_SECRET=.*|SESSION_SECRET=$SESSION_SECRET|" "$ENV_FILE"
  sed -i "s|INTERNAL_HOOK_SECRET=.*|INTERNAL_HOOK_SECRET=$INTERNAL_HOOK_SECRET|" "$ENV_FILE"
  sed -i "s|CRON_SECRET=.*|CRON_SECRET=$CRON_SECRET|" "$ENV_FILE"
  sed -i "s|AI_CONFIG_ENCRYPTION_KEY=.*|AI_CONFIG_ENCRYPTION_KEY=$AI_CONFIG_ENCRYPTION_KEY|" "$ENV_FILE"
  sed -i "s|WORKFLOW_SECRET_ENCRYPTION_KEY=.*|WORKFLOW_SECRET_ENCRYPTION_KEY=$WORKFLOW_SECRET_ENCRYPTION_KEY|" "$ENV_FILE"
  sed -i "s|RUNNER_SECRET=.*|RUNNER_SECRET=$RUNNER_SECRET|" "$ENV_FILE"
  sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" "$ENV_FILE"
  sed -i "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PASSWORD|" "$ENV_FILE"

  # Generate backup encryption key
  BACKUP_KEY=$(openssl rand -hex 32)
  sed -i "s|BACKUP_ENCRYPTION_KEY=.*|BACKUP_ENCRYPTION_KEY=$BACKUP_KEY|" "$ENV_FILE"

  echo -e "${GREEN}✓ Secrets generated and written to .env${NC}"
else
  echo -e "${GREEN}.env already exists, using existing config${NC}"
fi

# ── 2. Validate required variables ───────────────────────────
echo ""
echo "Validating configuration..."

REQUIRED_VARS=(
  "JWT_SECRET"
  "INTERNAL_HOOK_SECRET"
  "CRON_SECRET"
  "AI_CONFIG_ENCRYPTION_KEY"
  "WORKFLOW_SECRET_ENCRYPTION_KEY"
  "RUNNER_SECRET"
  "POSTGRES_PASSWORD"
  "REDIS_PASSWORD"
)

MISSING=0
for var in "${REQUIRED_VARS[@]}"; do
  value=$(grep "^${var}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2-)
  if [ -z "$value" ] || echo "$value" | grep -q "change-this\|^$\|Set "; then
    echo -e "${RED}✗ $var is not set or still has default value${NC}"
    MISSING=1
  else
    echo -e "${GREEN}✓ $var${NC}"
  fi
done

if [ "$MISSING" -eq 1 ]; then
  echo ""
  echo -e "${RED}Some secrets are missing. Run without --auto to fix interactively.${NC}"
  if [ "$AUTO_MODE" = false ]; then
    echo "Edit .env and re-run this script."
  fi
  exit 1
fi

# ── 3. Validate SITE_URL ─────────────────────────────────────
SITE_URL=$(grep "^SITE_URL=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2-)
if echo "$SITE_URL" | grep -q "localhost\|127.0.0.1"; then
  echo -e "${YELLOW}⚠ SITE_URL is set to localhost — change to your public domain for production${NC}"
  if [ "$AUTO_MODE" = false ]; then
    read -p "Enter your production domain (e.g., https://git.example.com): " NEW_URL
    if [ -n "$NEW_URL" ]; then
      sed -i "s|SITE_URL=.*|SITE_URL=$NEW_URL|" "$ENV_FILE"
      sed -i "s|SERVER_URL=.*|SERVER_URL=$NEW_URL|" "$ENV_FILE"
      sed -i "s|ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=$NEW_URL|" "$ENV_FILE"
      echo -e "${GREEN}✓ SITE_URL updated to $NEW_URL${NC}"
    fi
  fi
fi

# ── 4. Check Docker ──────────────────────────────────────────
echo ""
if ! command -v docker &> /dev/null; then
  echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo -e "${RED}Docker Compose V2 is not available.${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Docker $(docker --version | awk '{print $3}')${NC}"
echo -e "${GREEN}✓ Docker Compose $(docker compose version | awk '{print $4}')${NC}"

# ── 5. Print summary ─────────────────────────────────────────
echo ""
echo -e "${GREEN}Configuration summary:${NC}"
echo "  App:           http://localhost:4321 (internal)"
echo "  SSH Git:       ssh://git@localhost:2222"
echo "  Database:      PostgreSQL (internal)"
echo "  Redis:         (internal, password-protected)"
echo "  Metrics:       http://localhost:4321/api/metrics (internal)"
echo ""
echo -e "${YELLOW}To start with Caddy reverse proxy (recommended for production):${NC}"
echo "  docker compose --profile production up -d"
echo ""
echo -e "${YELLOW}To start without Caddy (development/testing):${NC}"
echo "  docker compose up -d"
echo ""
echo -e "${YELLOW}To include CI runner:${NC}"
echo "  docker compose --profile production --profile with-runner up -d"
echo ""

# ── 6. Start if requested ────────────────────────────────────
if [ "$START_AFTER" = true ]; then
  echo "Starting production stack..."
  docker compose --profile production up -d
  echo ""
  echo -e "${GREEN}OpenCodeHub is starting. Check status with:${NC}"
  echo "  docker compose ps"
  echo "  docker compose logs -f app"
fi
