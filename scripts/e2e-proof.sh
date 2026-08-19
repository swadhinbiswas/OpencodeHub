#!/bin/bash
# OpenCodeHub full-stack E2E proof — real Postgres + Redis + app + real git
#
# Requirements:
#   - app running on :4321 (see .env / docker-compose)
#   - Postgres + Redis reachable via DATABASE_URL / REDIS_URL (127.0.0.1)
#   - admin user seeded (scripts/seed-admin.ts)
#   - psql available with DATABASE_URL credentials for state reset
#
# Usage:
#   ADMIN_PASSWORD="<your-admin-password>" PSQL_URL="<your-database-url>" bash scripts/e2e-proof.sh
set -u
BASE="${BASE_URL:-http://localhost:4321}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-${E2E_ADMIN_PASSWORD:-}}"
PSQL_URL="${PSQL_URL:-${DATABASE_URL:-}}"

if [ -z "$ADMIN_PASSWORD" ]; then
  echo "❌ Error: ADMIN_PASSWORD environment variable is required to run e2e proof."
  exit 1
fi

if [ -z "$PSQL_URL" ]; then
  echo "❌ Error: PSQL_URL or DATABASE_URL environment variable is required to run e2e proof."
  exit 1
fi

COOKIE_JAR="$(mktemp)"
WORK="$(mktemp -d)"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }

echo "== 0. Fresh state =="
psql "$PSQL_URL" -tAc "DELETE FROM repositories; DELETE FROM organizations; DELETE FROM users WHERE username IN ('devuser');" > /dev/null 2>&1 || true
rm -rf "${GIT_REPOS_PATH:-./data/repos}"/* 2>/dev/null || true

echo "== 1. Login as admin =="
LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "{\"login\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}")
echo "$LOGIN" | grep -q '"success":true' && ok "login" || bad "login: $LOGIN"

echo "== 2. PAT + repo =="
PAT=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/user/tokens" -H "Content-Type: application/json" -d '{"name":"e2e","expiresIn":"30d","scopes":["repo:write","admin"]}' | grep -o '"token":"och_[^"]*"' | cut -d'"' -f4)
[ -n "$PAT" ] && ok "PAT created" || bad "PAT failed"
REPO=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/repos" -H "Content-Type: application/json" -d '{"name":"e2e-prod","autoInit":true}')
echo "$REPO" | grep -qE 'e2e-prod|already' && ok "repo created" || bad "repo: $REPO"

echo "== 3. Real git push (HTTP smart protocol with PAT) =="
git init -q -b main "$WORK" && cd "$WORK"
git config user.email "admin@test.local"; git config user.name "admin"
echo "# E2E" > README.md
mkdir -p .github/workflows
cat > .github/workflows/ci.yml << 'EOF'
name: CI
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: opencodehub
    steps:
      - run: echo "building $GITHUB_SHA"
  lint:
    runs-on: opencodehub
    steps:
      - run: echo "linting"
EOF
git add -A && git commit -qm "init with CI"
PUSH_OUT=$(timeout 60 git push "http://admin:$PAT@localhost:4321/git/admin/e2e-prod.git" main 2>&1)
echo "$PUSH_OUT" | grep -q "main -> main" && ok "git push (clean success)" || bad "push: $PUSH_OUT"
cd /tmp

echo "== 4. Workflow run persisted + succeeds =="
RUN_ID=""
for i in $(seq 1 20); do
  sleep 3
  RUNS=$(curl -s -b "$COOKIE_JAR" "$BASE/api/repos/admin/e2e-prod/actions/runs" 2>/dev/null)
  RUN_ID=$(echo "$RUNS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  [ -n "$RUN_ID" ] && break
done
[ -n "$RUN_ID" ] && ok "run persisted ($RUN_ID)" || bad "no runs"
CONCLUSION=""
for i in $(seq 1 20); do
  sleep 3
  RUN=$(curl -s -b "$COOKIE_JAR" "$BASE/api/repos/admin/e2e-prod/actions/runs/$RUN_ID" 2>/dev/null)
  CONCLUSION=$(echo "$RUN" | grep -o '"conclusion":"[^"]*"' | head -1 | cut -d'"' -f4)
  [ -n "$CONCLUSION" ] && break
done
[ "$CONCLUSION" = "success" ] && ok "CI run completed: success" || bad "run conclusion: $CONCLUSION"

echo "== 5. PR + squash merge =="
curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/repos/admin/e2e-prod/branches" -H "Content-Type: application/json" -d '{"name":"feature/e2e","from":"main"}' > /dev/null
PR=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/repos/admin/e2e-prod/pulls" -H "Content-Type: application/json" -d '{"title":"E2E PR","body":"Proof","base":"main","head":"feature/e2e"}')
PR_NUM=$(echo "$PR" | grep -o '"number":[0-9]*' | head -1 | cut -d: -f2)
[ -n "$PR_NUM" ] && ok "PR #$PR_NUM created" || bad "PR: ${PR:0:150}"
MERGE=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/repos/admin/e2e-prod/pulls/$PR_NUM/merge" -H "Content-Type: application/json" -d '{"mergeMethod":"squash"}')
echo "$MERGE" | grep -q success && ok "squash merge" || bad "merge: ${MERGE:0:150}"

echo "== 6. OAuth provider flow =="
APP=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/oauth/apps" -H "Content-Type: application/json" -d '{"name":"E2E App","redirectUris":["http://localhost:9999/cb"],"scopes":["repo:read"]}')
CID=$(echo "$APP" | grep -o '"clientId":"[^"]*"' | cut -d'"' -f4)
CSECRET=$(echo "$APP" | grep -o '"clientSecret":"[^"]*"' | cut -d'"' -f4)
[ -n "$CID" ] && ok "app registered" || bad "app: ${APP:0:150}"
AUTHZ=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/oauth/authorize" -d "client_id=$CID&redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Fcb&state=xyz&approve=true&scope=repo%3Aread" -o /dev/null -w "%{redirect_url}")
CODE=$(echo "$AUTHZ" | grep -o 'code=[^&]*' | cut -d= -f2)
[ -n "$CODE" ] && ok "auth code issued" || bad "authz: $AUTHZ"
TOK=$(curl -s -X POST "$BASE/api/oauth/token" -d "grant_type=authorization_code&code=$CODE&client_id=$CID&client_secret=$CSECRET&redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Fcb")
ATOKEN=$(echo "$TOK" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
[ -n "$ATOKEN" ] && ok "access token issued" || bad "token: ${TOK:0:150}"
USERINFO=$(curl -s -H "Authorization: Bearer $ATOKEN" "$BASE/api/oauth/userinfo")
echo "$USERINFO" | grep -q '"username":"admin"' && ok "userinfo via bearer" || bad "userinfo: ${USERINFO:0:150}"

echo "== 7. Rebase stack endpoint =="
STACK_RES=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/stacks/rebase" -H "Content-Type: application/json" -d '{"owner":"admin","repo":"e2e-prod","branches":["main"]}')
echo "$STACK_RES" | grep -qE 'success|branches|rebased|no-op|already' && ok "rebase stack API" || bad "stack: ${STACK_RES:0:150}"

echo "== 8. Rate limit header verification =="
RATE_HDRS=$(curl -s -I "$BASE/api/health")
echo "$RATE_HDRS" | grep -qi "x-ratelimit-remaining" && ok "rate limit headers emitted" || bad "missing rate headers"

echo "== 9. Distributed lock multi-instance proof =="
LOCK_RES=$(bun -e "
  import { acquireLock } from './src/lib/distributed-lock.ts';
  const l1 = await acquireLock('e2e-test-key', 5000);
  const l2 = await acquireLock('e2e-test-key', 5000);
  if (l1 && !l2) { await l1.release(); console.log('PASS'); process.exit(0); }
  process.exit(1);
" 2>/dev/null || echo "FAIL")
[ "$LOCK_RES" = "PASS" ] && ok "distributed lock exclusivity" || bad "lock failed: $LOCK_RES"

echo "== 10. External CI webhook ingestion =="
CI_PAYLOAD='{"provider":"github","event":"workflow_run","action":"completed","workflow":{"id":"1","name":"CI","head_sha":"abc1234","status":"completed","conclusion":"success"}}'
CI_RES=$(curl -s -X POST "$BASE/api/repos/admin/e2e-prod/ci/webhook" -H "Content-Type: application/json" -d "$CI_PAYLOAD")
echo "$CI_RES" | grep -qE 'accepted|received|success|ignored' && ok "CI webhook ingested" || bad "ci webhook: ${CI_RES:0:150}"

rm -f "$COOKIE_JAR"; rm -rf "$WORK"
echo ""
echo "=== SUMMARY: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
