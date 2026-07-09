#!/bin/bash
# OpenCodeHub Health Check Script
# Quick CLI health check for monitoring/alerting
# Usage: bash scripts/health-check.sh [URL]
set -euo pipefail

URL="${1:-http://localhost:4321}"
METRICS_URL="${URL}/api/metrics"
HEALTH_URL="${URL}/api/health"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "OpenCodeHub Health Check"
echo "========================"
echo "Target: $URL"
echo ""

# 1. Health endpoint
echo -n "Health endpoint:  "
HEALTH=$(curl -sf --max-time 10 "$HEALTH_URL" 2>/dev/null)
if [ $? -eq 0 ]; then
  STATUS=$(echo "$HEALTH" | jq -r '.status' 2>/dev/null || echo "unknown")
  UPTIME=$(echo "$HEALTH" | jq -r '.uptime' 2>/dev/null || echo "?")
  VERSION=$(echo "$HEALTH" | jq -r '.version' 2>/dev/null || echo "?")
  if [ "$STATUS" = "healthy" ]; then
    echo -e "${GREEN}✓ $STATUS${NC} (uptime: ${UPTIME}s, version: $VERSION)"
  else
    echo -e "${RED}✗ $STATUS${NC}"
  fi

  # Print sub-checks
  echo "$HEALTH" | jq -r '.checks | to_entries[] | "  \(.key): \(.value.status) \(if .value.latency then "(\(.value.latency)ms)" else "" end) \(if .value.message then "- \(.value.message)" else "" end)"' 2>/dev/null
else
  echo -e "${RED}✗ unreachable${NC}"
fi

echo ""

# 2. Metrics endpoint
echo -n "Metrics endpoint: "
METRICS=$(curl -sf --max-time 10 "$METRICS_URL" 2>/dev/null)
if [ $? -eq 0 ]; then
  LINES=$(echo "$METRICS" | wc -l)
  echo -e "${GREEN}✓ available${NC} ($LINES metric lines)"

  # Extract key metrics
  HTTP_REQUESTS=$(echo "$METRICS" | grep '^http_requests_total ' | head -1 | awk '{print $2}' 2>/dev/null || echo "?")
  DB_ERRORS=$(echo "$METRICS" | grep '^db_query_errors_total ' | head -1 | awk '{print $2}' 2>/dev/null || echo "0")
  echo "  Total HTTP requests: $HTTP_REQUESTS"
  echo "  DB query errors: $DB_ERRORS"
else
  echo -e "${YELLOW}⚠ not accessible${NC}"
fi

echo ""

# 3. Process check
echo -n "Process alive:    "
if curl -sf --max-time 5 "$URL" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ responding${NC}"
else
  echo -e "${RED}✗ not responding${NC}"
fi

echo ""
echo "Done."
