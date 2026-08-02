---
title: "Exposing OpenCodeHub from a NAS or home server"
slug: "administration/expose-nas-home-server"
---

# Exposing OpenCodeHub from a NAS or home server

> **Difficulty:** Intermediate | **Time:** 30-60 minutes | **Audience:** self-hosters on a NAS, home lab, Raspberry Pi, mini-PC, or VPS without a public IP

This guide covers the two most popular ways to put an OpenCodeHub
instance running on a NAS or home server on the public internet **without
opening inbound ports on your router** and **without exposing your home
IP**:

- **[Tailscale Funnel](https://tailscale.com/kb/1223/funnel/)** — WireGuard-based mesh VPN with a public ingress; the simplest option if you already use Tailscale.
- **[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)** — an outbound-only `cloudflared` daemon that fronts your app with Cloudflare's edge.

Both options work whether your ISP gives you a public IP, CGNAT, a
double-NAT, or a captive portal.  Both terminate TLS at the edge
(Cloudflare's network or Tailscale's edge), so you do not need to
manage certificates or open `:80`/`:443` on your router.

If you do have a public IP and a domain, the
[deploy-nas.md](./deploy-nas.md) guide covers the traditional
reverse-proxy + Let's Encrypt path.  The two methods below are
preferred because they require **zero port forwarding**.

---

## At a glance

| Method | Outbound from home? | Inbound to home? | Free tier | Custom domain | Best for |
|---|---|---|---|---|---|
| **Tailscale Funnel** | yes (WireGuard) | none | yes (personal use) | yes, but only one hostname per funnel | Already using Tailscale; simple, single-user / small-team setups |
| **Cloudflare Tunnel** | yes (HTTP/2) | none | yes (unlimited tunnels) | yes, full DNS support | Public-facing deployments, larger teams, custom domains, edge caching |

Both methods are **outbound-only** from your NAS.  Your router's
firewall never sees an inbound connection to OpenCodeHub ports.

---

## 0. Prerequisites

Whatever exposure method you pick, you need:

1. **A working OpenCodeHub instance** on your NAS, listening on a local port (default `4321`).
2. **A reachable hostname** (Tailscale or Cloudflare) pointed at the tunnel.
3. **A persistent `cloudflared` or `tailscaled`** process — running on the NAS, in Docker, or as a system service.
4. **Trusted Proxies** correctly set in OpenCodeHub (so the real client IP is preserved and rate limits are not bypassed).  See `TRUSTED_PROXIES` in `.env.example`.

> If you do not yet have OpenCodeHub running, see
> [deploy-nas.md](./deploy-nas.md) for the Docker setup first.

---

## 1. Tailscale Funnel

[Tailscale](https://tailscale.com/) is a WireGuard-based mesh VPN.
**Tailscale Funnel** is the public-ingress feature: it lets you expose
a service running on any node in your tailnet to the public internet
through Tailscale's edge, using a stable HTTPS URL.

### Why Tailscale Funnel

- Single binary, single auth key.
- TLS terminated at Tailscale's edge — your NAS never sees the public
  traffic in the clear.
- Stable hostname: `https://<node-name>.<tailnet>.ts.net`.
- No port forwarding, no firewall changes, no certificate management.
- Works on CGNAT, mobile broadband, hotel Wi-Fi.

### Step 1.1 — Install Tailscale on the NAS

On the NAS (or in a container with `--net=host` and `tailscaled` running
on the host), install Tailscale:

```bash
# Synology DSM 7: install from Package Center (community package), or:
curl -fsSL https://tailscale.com/install.sh | sh

# TrueNAS SCALE: install the TrueNAS Tailscale app from the catalog
# QNAP: install via Container Station as a Linux container
# Generic Linux / Raspberry Pi OS:
curl -fsSL https://tailscale.com/install.sh | sh
```

Authenticate:

```bash
sudo tailscale up
```

Follow the URL it prints, sign in, and approve the device.  Confirm
with:

```bash
tailscale status   # should show your NAS as a node
tailscale ip -4    # 100.x.y.z
```

### Step 1.2 — Expose OpenCodeHub via Funnel

```bash
# Tailscale Funnel is currently in beta and must be enabled per tailnet
# in the Tailscale admin console: https://login.tailscale.com/admin
# (turn on the "Funnel" feature flag).
#
# Then on the NAS, expose the port OpenCodeHub listens on (default 4321):
sudo tailscale funnel 4321 on

# Or expose a specific path with HTTPS-only:
sudo tailscale funnel --https=443 http://localhost:4321
```

You will get a public URL like `https://nas-hostname.tail-net.ts.net`.
Funnel enforces HTTPS; you do not need to manage certificates.

### Step 1.3 — Lock the funnel to your hostname only

By default, Funnel exposes the service to the public.  You can restrict
it to your account with `tailscale set --operator`:

```bash
sudo tailscale set --operator=$USER
```

For ACLs (which users in your tailnet can enable Funnel), see the
[Tailscale ACL docs](https://tailscale.com/kb/1018/acls/).

### Step 1.4 — Persistent funnel

`tailscale funnel` does not persist across reboots by itself.  To
auto-start it on boot, create a small systemd unit or add the command
to your NAS's startup scripts.

For Synology DSM, use **Task Scheduler → Triggered task → Boot-up** and
run:

```bash
sudo tailscale funnel 4321 on
```

For TrueNAS SCALE, configure the Tailscale app's "Post-Start" command
in the app config.

### Step 1.5 — OpenCodeHub environment

Set the public URL in `.env`:

```env
SITE_URL=https://nas-hostname.tail-net.ts.net
TRUSTED_PROXIES=127.0.0.1,100.64.0.0/10   # Tailscale CGNAT range
```

Tailscale's edge IPs all live in `100.64.0.0/10` (CGNAT).  Adding that
to `TRUSTED_PROXIES` lets OpenCodeHub read the real client IP from
`X-Forwarded-For`.

### Step 1.6 — Verify

```bash
curl -sI https://nas-hostname.tail-net.ts.net
# HTTP/2 200
# server: Caddy   (Tailscale's edge)
```

Open the URL in a browser; you should land on the OpenCodeHub login
page.  `git clone https://nas-hostname.tail-net.ts.net/<owner>/<repo>.git`
should also work.

---

## 2. Cloudflare Tunnel

[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
uses a lightweight daemon (`cloudflared`) running on your NAS to
establish an outbound tunnel to Cloudflare's edge.  Cloudflare
terminates TLS and proxies requests to your service.

### Why Cloudflare Tunnel

- Free, unlimited tunnels.
- Use any hostname you own on Cloudflare (or bring a partial-setup
  domain).
- Edge caching, rate limiting, WAF rules, analytics, all available
  out-of-the-box.
- No port forwarding, no public IP required.
- Zero-trust access controls (Cloudflare Access) for
  password-protecting `/admin` paths.
- Production-grade — same plumbing Cloudflare uses for its own apps.

### Step 2.1 — Add your domain to Cloudflare

If you have not already, sign up at [dash.cloudflare.com](https://dash.cloudflare.com/),
add your domain (`git.example.com`), and let Cloudflare manage its
DNS.  Free tier is enough.

### Step 2.2 — Create the tunnel

In the Cloudflare Zero Trust dashboard:

1. **Networks → Tunnels → Create a tunnel**
2. Pick a name (e.g. `opencodehub-home`).
3. Cloudflare shows you a `cloudflared` install command and a token
   that looks like:

   ```
   eyJhIjoixxxxxxxxxxxxx...   # ~64 bytes, base64
   ```

   Save this token; you will pass it as `TUNNEL_TOKEN`.

Alternatively, you can use the CLI:

```bash
cloudflared tunnel login           # opens a browser
cloudflared tunnel create opencodehub-home
cloudflared tunnel token opencodehub-home
```

### Step 2.3 — Run `cloudflared` on the NAS

#### Option A — Docker (recommended on Synology / QNAP / generic)

Create a `docker-compose.cloudflared.yml` on the NAS:

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:2024.12.2
    container_name: cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${TUNNEL_TOKEN}
    # Uncomment if you want host networking (lets cloudflared reach
    # services on localhost without the docker bridge):
    # network_mode: host
```

```bash
echo "TUNNEL_TOKEN=eyJhIjoixxxxxx..." > .env.cloudflared
docker compose -f docker-compose.cloudflared.yml --env-file .env.cloudflared up -d
```

#### Option B — Bare-metal / systemd

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared
sudo cloudflared service install <TUNNEL_TOKEN>
```

#### Option C — TrueNAS SCALE

Install the **Cloudflare Tunnel** community app, paste the tunnel
token in the app config, and start it.

### Step 2.4 — Route a public hostname to OpenCodeHub

In the Cloudflare dashboard → your tunnel → **Public Hostname**:

| Setting | Value |
|---|---|
| Subdomain | `git` (or anything) |
| Domain | `example.com` |
| **Service** | Type: `HTTP`, URL: `opencodehub:4321` (or `localhost:4321` if `cloudflared` is host-networking) |

If you used Option A (Docker bridge network), `opencodehub` must be the
service name in your OpenCodeHub `docker-compose.yml`.  If you used
host networking, use `localhost:4321`.

Save.  After a few seconds, `https://git.example.com` should reach your
OpenCodeHub instance.

### Step 2.5 — OpenCodeHub environment

```env
SITE_URL=https://git.example.com
TRUSTED_PROXIES=127.0.0.1,172.16.0.0/12   # add 100.64.0.0/10 if also using Tailscale
```

Cloudflare's edge IPs are public; the requests arriving at your NAS
come from the `cloudflared` daemon, which is local.  So `127.0.0.1` in
`TRUSTED_PROXIES` is sufficient.  Cloudflare's real client IP is in
`CF-Connecting-IP`; OpenCodeHub's middleware reads
`X-Forwarded-For` / `CF-Connecting-IP` to set the real client IP.

### Step 2.6 — Optional: password-protect `/admin` with Cloudflare Access

1. **Access → Applications → Add an application → Self-hosted**
2. Name: `OpenCodeHub admin`
3. Domain: `git.example.com/admin*`
4. Policy: allow only your email / a specific group.

Now reaching the admin UI requires a one-time code from Cloudflare —
no OpenCodeHub credentials are needed for the attacker, but they
cannot reach the page at all.

### Step 2.7 — Verify

```bash
curl -sI https://git.example.com
# HTTP/2 200
# server: cloudflare
# cf-ray: ...
```

And test git:

```bash
git clone https://git.example.com/<owner>/<repo>.git
```

---

## 3. Hardening checklist

Once your instance is reachable from the internet, lock it down:

1. **Set strong secrets.**  Rotate `JWT_SECRET`, `SESSION_SECRET`,
   `INTERNAL_HOOK_SECRET`, and `RUNNER_SECRET` with
   `openssl rand -hex 32`.  Never reuse a value across environments.
2. **Enable rate limiting** with `RATE_LIMIT_ENABLED=true` and set
   `RATE_LIMIT_REDIS_URL` to a Redis (or Upstash) instance — without
   Redis, rate-limit state is per-process and bypassable by horizontal
   scale-out.
3. **Put the database behind the same tunnel.**  PostgreSQL, Redis, and
   the MinIO S3 endpoint should **not** be exposed on the public
   internet.  If you must use a public Postgres, require SSL and a
   strong password.
4. **SSH git is optional.**  Tailscale Funnel and Cloudflare Tunnel
   expose HTTP/S only.  If you need SSH git (`git@...`), expose a
   separate Tailscale node (no Funnel) and have your devs join the
   tailnet, **or** terminate SSH at the Cloudflare edge with
   [Cloudflare Spectrum](https://developers.cloudflare.com/spectrum/).
5. **Set `TRUSTED_PROXIES` correctly** — see the two example values
   above.  Without this, attackers can spoof their client IP by
   sending `X-Forwarded-For` themselves and bypass IP-based rate
   limits.
6. **Enable 2FA** for every account (especially admins).  OpenCodeHub
   supports TOTP-based 2FA in user settings.
7. **Back up the storage path and database.**  Even with S3-compatible
   storage, the SQLite/Postgres database and `.env` need offsite
   backups.  `scripts/sync-storage.ts` will mirror the storage root to
   a second bucket; `pg_dump` (or `litestream` for SQLite) handles the
   database.
8. **Monitor.**  Subscribe to the `/api/health` endpoint with a free
   uptime monitor (UptimeRobot, Healthchecks.io, BetterStack).  Tailscale
   and Cloudflare both expose access logs you can ship to a SIEM.

---

## 4. When to use which method

- **Pick Tailscale Funnel** if you already use Tailscale for
  other services on your home network, want zero DNS hassle, and are
  happy with a `*.ts.net` URL (or one custom domain).
- **Pick Cloudflare Tunnel** if you need a real custom domain
  (`git.example.com`), want Cloudflare's edge features (caching,
  WAF, rate limiting, Access), or expect any kind of public traffic.
- **Pick plain reverse proxy** (`deploy-nas.md`) if you have a
  static public IP, are comfortable opening ports 80/443, and want to
  avoid the third-party dependency.

All three are production-acceptable; the difference is operational,
not security.  Tailscale Funnel and Cloudflare Tunnel have the edge
on security because they do not require a publicly routable address
on the NAS itself.

---

## 5. Troubleshooting

### "TLS handshake failed" from your domain

- Confirm the tunnel daemon is running:
  - Tailscale: `tailscale status` shows the node as **active** and
    `tailscale funnel status` shows the port.
  - Cloudflare: the tunnel status is **HEALTHY** in the Zero Trust
    dashboard.
- Confirm OpenCodeHub is reachable from the tunnel's network namespace:
  - Tailscale (host networking): `curl http://localhost:4321`
  - Cloudflare (Docker bridge): `docker exec cloudflared wget -qO- http://opencodehub:4321/`

### Real client IP is wrong

`TRUSTED_PROXIES` is not set, or it does not include the proxy IP.
OpenCodeHub's `src/middleware.ts` and `src/middleware/rate-limit.ts`
only honour `X-Forwarded-For` from IPs in `TRUSTED_PROXIES`.

### "git push" hangs

Tailscale Funnel and Cloudflare Tunnel both have a default timeout of
100 seconds per request.  Large initial pushes that take longer than
that will time out.  Solutions:
- Use `git push --depth=...` and shallow-clone for the first push.
- Run `git gc` on the local clone before pushing.
- For Cloudflare: configure a higher timeout under
  **Tunnels → your tunnel → Timeout**.

### SSH git does not work

Tailscale Funnel does not support arbitrary TCP — only HTTP/S.  For
SSH, either:
- Have your devs install Tailscale on their machines and SSH directly
  to the NAS via the tailnet (`ssh user@nas-hostname`), **or**
- Use Cloudflare Spectrum (paid) to proxy TCP/22 to the NAS.

### Local network is slow after enabling the tunnel

The tunnel daemon proxies every request through the edge, so local
LAN clients may see higher latency.  For LAN use, add a local DNS
record (`git.example.com` → `192.168.x.y`) and let LAN clients hit
OpenCodeHub directly.

---

## 6. See also

- [deploy-nas.md](./deploy-nas.md) — full NAS deployment guide
  (Docker, storage, ssh, etc.).
- [storage-adapters.md](../guides/storage-adapters.md) — pick a
  storage backend for your repositories.
- [security.md](./security.md) — accepted vulnerabilities, secret
  rotation, audit log review.
- [Tailscale Funnel docs](https://tailscale.com/kb/1223/funnel/)
- [Cloudflare Tunnel docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
