---
title: "Security Hardening"
description: "Security settings and production safeguards."
---

OpenCodeHub includes multiple built‑in security protections and requires strong secrets in production.

## Required secrets

Set strong values in `.env`:

- `JWT_SECRET` (minimum 32 chars)
- `SESSION_SECRET` (minimum 32 chars)
- `INTERNAL_HOOK_SECRET`

## Built‑in protections

- Rate limiting for authentication
- CSRF protection for state‑changing requests
- Input validation for API payloads
- Hook authentication for internal Git hooks

## Recommendations

- Rotate tokens periodically.
- Use HTTPS in production.
- Enable and monitor audit logs.
- Restrict access to runner and storage secrets.
