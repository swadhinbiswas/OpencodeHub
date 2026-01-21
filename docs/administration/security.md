# Security Best Practices

Securing your OpenCodeHub instance is critical, especially when exposing it to the internet.

## 1. HTTPS is Mandatory

In production, **never** run OpenCodeHub over HTTP. Git operations and login credentials must be encrypted.

- Use a reverse proxy (Nginx, Caddy, Traefik) to handle SSL/TLS.
- See the [Deployment Guide](deployment.md) for Nginx configuration.

## 2. Generate Strong Secrets

Do not use the default secrets from `.env.example`.

Generate new 64-character hex secrets for:
- `JWT_SECRET`
- `SESSION_SECRET`
- `INTERNAL_HOOK_SECRET`

```bash
openssl rand -hex 32
```

## 3. Database Security

- **Do not expose your database port** (5432/3306) to the public internet.
- Ensure the database user has limited privileges if possible (though migrations require DDL permissions).
- Enable SSL connections to the database by appending `?sslmode=require` to your `DATABASE_URL`.

## 4. Rate Limiting

OpenCodeHub includes built-in rate limiting.

- **Auth**: 5 attempts / 15 min
- **API**: 100 requests / min
- **Git**: 200 operations / min

You can adjust these in `.env` if you have a large team behind a NAT, but be careful.

## 5. Branch Protection

Enable **Branch Protection** on `main` for all repositories to prevent:
- Force pushes.
- Deleting the branch.
- Merging without review.

## 6. Private Mode

If your instance is private:
1. Disable public registration by setting `ENABLE_REGISTRATION=false` (Future feature, currently needs manual code edit or Invite Only mode).
2. Set default repository visibility to `private`.
