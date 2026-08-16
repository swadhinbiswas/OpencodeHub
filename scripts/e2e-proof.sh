#!/bin/bash
# OpenCodeHub full-stack E2E proof — real Postgres + Redis + app + real git
#
# Requirements:
#   - app running on :4321 (see .env / docker-compose)
#   - Postgres + Redis reachable via DATABASE_URL / REDIS_URL (127.0.0.1)
#   - admin user seeded with password AdminPass123! (scripts/seed-admin.ts)
#   - psql available with the DATABASE_DRIVER credentials for state reset
#
# Usage:
#   PSQL_URL="postgresql://och:och_secret_pw@127.0.0.1:5432/opencodehub" \
#   bash scripts/e2e-proof.sh
set -u
BASE="${BASE_URL:-http://localhost:4321}"
PSQL_URL="${PSQL_URL:-postgresql://och:och_secret_pw@127.0.0.1:5432/opencodehub}"
COOKIE_JAR="$(mktemp)"
WORK="$(mktemp -d)"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }

echo "== 0. Fresh state =="
psql "$PSQL_URL" -tAc "DELETE FROM repositories; DELETE FROM organizations; DELETE FROM users WHERE username IN ('devuser');" > /dev/null 2>&1 || true
rm -rf "${GIT_REPOS_PATH:-./data/repos}"/* 2>/dev/null || true

echo "== 1. Login as admin =="
LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"login":"admin","password":"AdminPass123!"}')
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

echo "== 7. Org + invite + transfer =="
curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" -d '{"username":"devuser","email":"dev@test.local","password":"DevPass123!"}' > /dev/null
DEVLOGIN=$(curl -s -c /tmp/och-dev-cookies.txt -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"login":"devuser","password":"DevPass123!"}')
echo "$DEVLOGIN" | grep -q '"success":true' && ok "second user created+login" || bad "dev user: $DEVLOGIN"
ORG_CREATE=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/orgs" -H "Content-Type: application/json" -d '{"name":"e2e-org","displayName":"E2E Org"}')
echo "$ORG_CREATE" | grep -qE 'e2e-org|already exists' && ok "org created (or pre-existing)" || bad "org create: $ORG_CREATE"
ORG_PAGE=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/orgs/e2e-org")
[ "$ORG_PAGE" = "200" ] && ok "org page renders" || bad "org page: $ORG_PAGE"
INVITE=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/orgs/e2e-org/invites" -H "Content-Type: application/json" -d '{"username":"devuser"}')
INVITE_TOKEN=$(echo "$INVITE" | grep -o 'token=[^"]*' | head -1 | cut -d= -f2)
[ -n "$INVITE_TOKEN" ] && ok "invite created" || bad "invite: ${INVITE:0:150}"
ACCEPT=$(curl -s -b /tmp/och-dev-cookies.txt -X POST "$BASE/api/orgs/accept-invite" -H "Content-Type: application/json" -d "{\"token\":\"$INVITE_TOKEN\"}")
echo "$ACCEPT" | grep -q success && ok "invite accepted" || bad "accept: ${ACCEPT:0:150}"
TRANSFER=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE/api/repos/admin/e2e-prod/transfer" -H "Content-Type: application/json" -d '{"orgName":"e2e-org"}')
echo "$TRANSFER" | grep -q success && ok "repo transferred to org" || bad "transfer: ${TRANSFER:0:150}"

echo "== 8. Org-owned repo APIs + checks =="
sleep 5
CHECKS=$(curl -s -b "$COOKIE_JAR" "$BASE/api/repos/e2e-org/e2e-prod/pulls/$PR_NUM/checks" 2>/dev/null)
echo "$CHECKS" | grep -q '"success":true' && ok "PR checks on org-owned repo" || bad "checks: ${CHECKS:0:150}"
curl -s "$BASE/api/health" | grep -q '"ok":true\|"status":"ok"' && ok "health" || bad "health"

echo ""
echo "════════════════════════════════════════"
echo "  E2E RESULT: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════"
rm -f "$COOKIE_JAR" /tmp/och-dev-cookies.txt
rm -rf "$WORK"
exit $FAIL
