# Security Best Practices

Securing your OpenCodeHub instance is critical, especially when exposing it to the internet.

---

## 1. HTTPS is Mandatory

In production, **never** run OpenCodeHub over HTTP. Git operations and login credentials must be encrypted.

- Use a reverse proxy (Nginx, Caddy, Traefik) to handle SSL/TLS.
- See the [Deployment Guide](deployment.md) for Nginx configuration.
- Set `SITE_URL` to your HTTPS domain.

---

## 2. Generate Strong Secrets

Do not use the default secrets from `.env.example`.

Generate new 64-character hex secrets for:
- `JWT_SECRET`
- `SESSION_SECRET`
- `INTERNAL_HOOK_SECRET`
- `CRON_SECRET`
- `RUNNER_SECRET`
- `WORKFLOW_SECRET_ENCRYPTION_KEY`
- `AI_CONFIG_ENCRYPTION_KEY`

```bash
openssl rand -hex 32
```

---

## 3. Database Security

- **Do not expose your database port** (5432) to the public internet.
- Ensure the database user has limited privileges if possible (though migrations require DDL permissions).
- Enable SSL connections to the database by appending `?sslmode=require` to your `DATABASE_URL`.
- Use PostgreSQL for production (not SQLite).
- Enable automated backups.

---

## 4. Rate Limiting

OpenCodeHub includes built-in rate limiting.

- **Auth**: 5 attempts / 15 min
- **API**: 100 requests / min
- **Git**: 200 operations / min

You can adjust these in `.env` if you have a large team behind a NAT, but be careful.

Enable with:
```bash
RATE_LIMIT_ENABLED=true
```

Skip in dev (not recommended for production):
```bash
RATE_LIMIT_SKIP_DEV=false
```

---

## 5. CSRF Protection

CSRF protection is enabled by default via double-submit cookie pattern.

- All state-changing operations (POST/PUT/PATCH/DELETE) require a valid CSRF token.
- The token is rotated per session.
- API clients using Bearer tokens are exempt (they use `Authorization` header instead).

---

## 6. Branch Protection

Enable **Branch Protection** on `main` for all repositories to prevent:
- Force pushes.
- Deleting the branch.
- Merging without review.
- Merging without passing CI.

Configure in Repository → Settings → Branches:
- Required PR reviews: 1-2
- Required status checks: CI pipeline names
- Dismiss stale reviews: enabled
- Include administrators: optional

---

## 7. Private Mode

If your instance is private:
1. Disable public registration by setting `ENABLE_REGISTRATION=false` (or use invite-only mode).
2. Set default repository visibility to `private`.
3. Require authentication for all Git operations (HTTP and SSH).

---

## 8. Webhook URL Validation

OpenCodeHub validates all outbound webhook URLs to prevent Server-Side Request Forgery (SSRF):

- Blocks private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Blocks localhost (127.0.0.1, [::1])
- Blocks link-local addresses
- Validates URL format and scheme (only http/https)

---

## 9. Secret Scanning

OpenCodeHub scans commits for accidentally committed secrets:

- API keys
- Passwords
- Private keys
- Database connection strings

When found, the push is rejected with a message indicating which file and line contained the secret.

---

## 10. Personal Access Tokens (PATs)

For API and Git access, use PATs instead of passwords:

1. Go to User Settings → Personal Access Tokens
2. Generate a new token with specific scopes
3. Use the token as the password for Git HTTPS operations
4. Use `Authorization: Bearer <token>` for API requests

PATs can be revoked individually without changing your password.

---

## 11. SSH Key Management

For Git SSH access:

1. Add your public key in Settings → SSH Keys
2. Use SSH URLs for cloning: `git@git.yourcompany.com:owner/repo.git`
3. Deploy keys (read-only or read-write) can be added per-repository

---

## 12. Content Security Policy (CSP)

OpenCodeHub sets strict CSP headers to prevent XSS attacks:

- `default-src 'self'`
- `script-src 'self' 'unsafe-inline'` (required for Astro hydration)
- `style-src 'self' 'unsafe-inline'`
- `img-src 'self' data: https:`
- `connect-src 'self'`

Review `src/middleware.ts` for the full CSP configuration.

---

## 13. Audit Logging

All security-relevant actions are logged:

- Login attempts (success and failure)
- Password changes
- Token creations and revocations
- Repository access changes
- Admin actions

Access logs via:
- Admin Panel → Audit Log
- API: `GET /api/admin/audit-logs`

---

## 14. Dependency Security

Keep dependencies up to date:

```bash
npm audit
npm audit fix
```

Consider enabling automated dependency updates via Dependabot or Renovate.

---

## 15. Incident Response

If you suspect a security incident:

1. **Rotate all secrets immediately** (JWT_SECRET, SESSION_SECRET, etc.)
2. **Revoke all PATs** and ask users to regenerate
3. **Check audit logs** for unauthorized access
4. **Review recent admin actions**
5. **Force password resets** for affected users

See [Incident Runbook](incident-runbook.md) for detailed procedures.

---

## Security Checklist

Before going live:

- [ ] All secrets regenerated (not using defaults from `.env.example`)
- [ ] HTTPS enabled with valid SSL certificate
- [ ] Rate limiting enabled
- [ ] Database using SSL connections
- [ ] Branch protection rules configured
- [ ] Public registration disabled (if private instance)
- [ ] Storage backend is external (S3/GCS/Azure), not local
- [ ] Backup strategy in place
- [ ] Audit logging enabled
- [ ] Admin users configured with strong passwords + 2FA
