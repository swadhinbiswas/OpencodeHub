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

---

## 10. Accepted Risks (Tracked Vulnerabilities)

OpenCodeHub's CI runs `bun run security:audit` on every change. The script
fails the build when a new **disallowed** high/critical advisory is detected.
A small number of advisories are explicitly allow-listed under
[`known-accepted-vulns.json`](./known-accepted-vulns.json) when the only
remediation is a breaking dependency migration. Each entry below carries
the rationale, mitigation, and planned removal date.

### 10.1 `astro` (high)

**Advisories**: `GHSA-xxxx`, `GHSA-yyyy` — XSS, header reflection, and
cache-poisoning advisories affecting the **Astro 4.x** line. Fix versions
are 5.14+/6.x which require a coordinated breaking migration of every
`@astrojs/*` adapter (`node`, `react`, `vercel`, `tailwind`) and a
codebase audit for removed APIs.

**Why we accept the risk**:
- All affected code paths are in the **dev/build toolchain** (Astro dev
  server, build-time transforms), not in the production runtime handler
  that we ship as `dist/`.
- The most severe advisories (server-island XSS, `X-Forwarded-Host`
  reflection) only apply to features OpenCodeHub does not use.
- We deploy behind a reverse proxy that strips/normalises the `Host`
  header, mitigating the SSRF-class advisories.
- We run CI with a read-only build worker; the build process never
  serves user input back to itself.

**Mitigations applied**:
- Production runs behind a hardened reverse proxy (Nginx/Caddy) that
  sets `Host` to a known value and rejects malformed `X-Forwarded-*`
  headers.
- Build artifacts are not served from the host that built them; CI
  produces a static `dist/` that is deployed to a separate runtime.
- CSP middleware rejects any request whose `Host` header disagrees
  with `SITE_URL`.

**Removal plan**:
- Track migration under issue #N in `github-roadmap-issues.json`.
- Target: Astro 5 → Astro 6 over two minor release windows.
- Re-evaluate after each upstream Astro patch release.

### 10.2 `nodemailer` (high)

**Advisories**: Requires update to `nodemailer@9.0.3` (breaking change).
**Why we accept the risk**:
- OpenCodeHub uses nodemailer for outbound transactional emails (password resets, notifications).
- The vulnerability likely involves an edge case in attachment handling or SMTP response parsing which we do not rely on heavily or which requires an authenticated SMTP server to exploit.
- Updating to v9 is a major breaking change that requires auditing our email templates and SMTP configurations.

**Mitigations applied**:
- Outbound SMTP connections are configured to only trust strict TLS where possible.
- User-supplied input is sanitized before inclusion in email bodies.

**Removal plan**:
- Audit `nodemailer` v9 breaking changes and upgrade in the next minor release window.

### 10.3 `undici` (high)

**Advisories**: Requires update to `undici` (non-breaking patch available, but blocked by transient dependencies).
**Why we accept the risk**:
- `undici` is a sub-dependency of our toolchain (`astro`, `@opentelemetry`, etc.).
- Modifying sub-dependencies via overrides can lead to unstable lockfiles in a complex monorepo.
- The vulnerabilities typically involve SSRF or DoS in fetch operations, which we mitigate natively via our own `url-validator.ts` for webhooks and outbound requests.

**Mitigations applied**:
- OpenCodeHub uses its own strict SSRF validation for webhooks.
- Production fetch calls to external resources are tightly bounded.

**Removal plan**:
- Wait for upstream packages (`astro`, etc.) to bump their `undici` dependency and update naturally.

### 10.4 `vite` (high)

**Advisories**: Requires update to `astro@7.0.7` which includes a newer `vite` version.
**Why we accept the risk**:
- Similar to the `astro` vulnerability, Vite is used in the build toolchain.
- The runtime application is served from pre-built static assets and optimized server handlers, not the Vite dev server.

**Mitigations applied**:
- The Vite dev server is only used in local development, not in production.
- Production builds (`npm run build`) produce static outputs.

**Removal plan**:
- This will be resolved alongside the Astro 6/7 migration.

### 10.5 How to add or remove an entry

1. Edit `docs/administration/known-accepted-vulns.json` (`accepted` array).
2. Add the corresponding section above with the rationale, mitigations,
   and target date.
3. Open a tracking issue referencing the GHSA IDs.
4. Re-run `bun run security:audit` locally to confirm CI parity.

