# API Authentication

OpenCodeHub supports multiple authentication methods for API and Git access.

---

## Authentication Methods

### 1. Web Session (Cookie)

Used by the browser UI. After logging in, a cookie named `och_session` is set containing a JWT.

- **Automatic** — No manual token management needed
- **CSRF protected** — All state-changing requests require a CSRF token
- **Expires** — Configurable session lifetime (default: 7 days)

### 2. Bearer Token (JWT)

For API clients and scripts. Pass the token in the `Authorization` header.

```http
GET /api/user HTTP/1.1
Host: git.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

Obtain a token by:
- Logging in via the web UI and extracting the JWT from the `och_session` cookie
- Using the CLI (`och auth login` stores the token in `~/.ochrc`)

### 3. Personal Access Token (PAT)

Recommended for long-lived API access and Git HTTPS operations.

**Creating a PAT:**
1. Go to **User Settings** → **Personal Access Tokens**
2. Click **Generate New Token**
3. Enter a descriptive name (e.g., "CI/CD Pipeline")
4. Select scopes:
   - `repo` — Full repository access
   - `repo:read` — Read-only repository access
   - `user` — Read user profile
   - `admin` — Admin operations
   - `webhook` — Manage webhooks
5. Set expiration (recommended: 90 days)
6. Copy the token (shown only once)

**Using a PAT:**

API:
```http
GET /api/repos/owner/repo/pulls HTTP/1.1
Authorization: Bearer och_xxxxxxxxxxxxxxxx
```

Git HTTPS:
```bash
git clone https://git.example.com/owner/repo.git
# Username: your-username
# Password: och_xxxxxxxxxxxxxxxx
```

### 4. Git SSH Key

For Git operations via SSH.

1. Add your public SSH key in **Settings** → **SSH Keys**
2. Clone using SSH:
```bash
git clone git@git.example.com:owner/repo.git
```

### 5. Deploy Keys

Per-repository SSH keys for CI/CD systems.

1. Go to **Repository** → **Settings** → **Deploy Keys**
2. Add a public key
3. Select permission: **Read-only** or **Read-write**

---

## Token Security

### Best Practices

- **Use PATs instead of passwords** for API access
- **Set expiration dates** on PATs (rotate regularly)
- **Use minimal scopes** — Only grant permissions needed
- **Revoke unused tokens** promptly
- **Never commit tokens** to git (use repository secrets for CI)

### Revoking Tokens

1. Go to **User Settings** → **Personal Access Tokens**
2. Find the token and click **Revoke**
3. The token is immediately invalidated

---

## Response Format

All API responses use a standard wrapper:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**With pagination:**
```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "perPage": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  }
}
```

---

## Rate Limits

Authenticated requests: 100 per minute
Unauthenticated requests: 20 per minute

Rate limit headers are included in all responses:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1714501200
```

---

## CLI Authentication

The easiest way to authenticate scripts:

```bash
# Login (stores token securely)
och auth login --url https://git.yourcompany.com

# View stored token
cat ~/.ochrc

# Use in scripts
TOKEN=$(jq -r '.token' ~/.ochrc)
curl -H "Authorization: Bearer $TOKEN" https://git.yourcompany.com/api/user
```

Token storage is secure:
- **macOS**: Keychain
- **Windows**: DPAPI
- **Linux**: secret-tool (libsecret)
