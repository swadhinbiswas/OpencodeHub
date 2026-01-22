---
title: "Deploy with Cloudflare"
description: "Deploy OpenCodeHub using Cloudflare services (Tunnel, R2, Pages)"
---

Cloudflare provides several services that integrate well with OpenCodeHub. This guide covers using Cloudflare Tunnel for secure access and R2 for storage.

## Cloudflare Services Overview

| Service               | Use Case                                          |
| --------------------- | ------------------------------------------------- |
| **Cloudflare Tunnel** | Securely expose your server without opening ports |
| **Cloudflare R2**     | S3-compatible object storage                      |
| **Cloudflare DNS**    | Fast DNS with DDoS protection                     |
| **Cloudflare Pages**  | Deploy docs-site (static)                         |

---

## Part 1: Cloudflare Tunnel

Cloudflare Tunnel (formerly Argo Tunnel) creates an encrypted tunnel from your server to Cloudflare's edge, eliminating the need to open ports.

### Prerequisites

- OpenCodeHub running on `localhost:3000`
- Cloudflare account with a domain
- `cloudflared` CLI installed

### Install cloudflared

```bash
# Debian/Ubuntu
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Or via package manager
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-archive-keyring.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared
```

### Authenticate

```bash
cloudflared tunnel login
# This opens a browser to authenticate with your Cloudflare account
```

### Create Tunnel

```bash
# Create tunnel
cloudflared tunnel create opencodehub

# Note the tunnel ID and credentials file path
# Example: ~/.cloudflared/<tunnel-id>.json
```

### Configure Tunnel

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <your-tunnel-id>
credentials-file: /home/user/.cloudflared/<tunnel-id>.json

ingress:
  # Main application
  - hostname: git.yourdomain.com
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      # Important for git operations
      disableChunkedEncoding: true

  # Catch-all (required)
  - service: http_status:404
```

### Route DNS

```bash
cloudflared tunnel route dns opencodehub git.yourdomain.com
```

### Run Tunnel

```bash
# Test
cloudflared tunnel run opencodehub

# Install as service
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

### Verify

Visit `https://git.yourdomain.com` - it should load OpenCodeHub!

---

## Part 2: Cloudflare R2 Storage

R2 is S3-compatible object storage with no egress fees.

### Create R2 Bucket

1. Go to Cloudflare Dashboard → **R2**
2. Click **Create bucket**
3. Name: `opencodehub-repos`
4. Location: Choose nearest region

### Create API Tokens

1. Go to **R2 → Manage R2 API Tokens**
2. Click **Create API Token**
3. Permissions: **Object Read & Write**
4. Specify bucket: `opencodehub-repos`
5. Copy the Access Key ID and Secret Access Key

### Configure OpenCodeHub

Add to your `.env`:

```bash
STORAGE_TYPE=s3
STORAGE_BUCKET=opencodehub-repos
STORAGE_REGION=auto
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY=<your-r2-access-key-id>
S3_SECRET_KEY=<your-r2-secret-access-key>
```

Find your account ID in Cloudflare Dashboard → R2 → Overview.

### Performance Note

:::caution[R2 Latency]
R2 has the same latency characteristics as other object storage. See [Storage Adapters - Performance Considerations](/guides/storage-adapters/#️-performance-considerations) for details and recommendations.
:::

---

## Part 3: Cloudflare DNS

### Recommended DNS Settings

| Type  | Name | Content                        | Proxy            |
| ----- | ---- | ------------------------------ | ---------------- |
| CNAME | git  | `<tunnel-id>.cfargotunnel.com` | Proxied (orange) |

If using Tunnel, the CNAME is created automatically.

### Security Settings

1. Go to **SSL/TLS → Overview**
2. Set mode to **Full (strict)**

3. Go to **Security → WAF**
4. Enable managed rules

---

## Part 4: Deploy Docs to Cloudflare Pages

The documentation site can be deployed to Cloudflare Pages for free.

### Connect Repository

1. Go to **Workers & Pages → Create application**
2. Select **Pages → Connect to Git**
3. Choose your OpenCodeHub repository

### Build Settings

| Setting                | Value                                          |
| ---------------------- | ---------------------------------------------- |
| Build command          | `cd docs-site && npm install && npm run build` |
| Build output directory | `docs-site/dist`                               |
| Root directory         | `/`                                            |

### Environment Variables

| Variable       | Value |
| -------------- | ----- |
| `NODE_VERSION` | `20`  |

### Custom Domain

1. Go to Pages project → **Custom domains**
2. Add `docs.yourdomain.com`
3. Cloudflare will configure DNS automatically

---

## Complete Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │     DNS     │  │     WAF     │  │    CDN      │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
│           │                              │               │
│           ▼                              ▼               │
│  ┌─────────────────┐           ┌─────────────────┐      │
│  │ Cloudflare      │           │ Cloudflare      │      │
│  │ Tunnel          │           │ Pages           │      │
│  │ (git.domain)    │           │ (docs.domain)   │      │
│  └────────┬────────┘           └─────────────────┘      │
└───────────┼─────────────────────────────────────────────┘
            │
            ▼ (encrypted tunnel)
    ┌───────────────────┐
    │   Your Server     │
    │  ┌─────────────┐  │
    │  │ OpenCodeHub │  │
    │  │ :3000       │  │
    │  └──────┬──────┘  │
    │         │         │
    │         ▼         │
    │  ┌─────────────┐  │
    │  │ PostgreSQL  │  │
    │  └─────────────┘  │
    └───────────────────┘
            │
            ▼ (S3 API)
    ┌───────────────────┐
    │  Cloudflare R2    │
    │  (repo storage)   │
    └───────────────────┘
```

---

## Benefits of Cloudflare Setup

| Benefit             | Description                  |
| ------------------- | ---------------------------- |
| **No open ports**   | Tunnel handles all ingress   |
| **DDoS protection** | Free, always-on              |
| **Free SSL**        | Automatic via Cloudflare     |
| **No egress fees**  | R2 has zero egress costs     |
| **Global CDN**      | Static assets cached at edge |
| **Analytics**       | Built-in traffic analytics   |

---

## Troubleshooting

### Tunnel Connection Drops

```bash
# Check tunnel status
cloudflared tunnel info opencodehub

# View logs
sudo journalctl -u cloudflared -f
```

### 502 Bad Gateway

1. Verify OpenCodeHub is running on port 3000
2. Check tunnel config points to correct port
3. Verify `localhost:3000` is accessible locally

### R2 Access Denied

1. Verify API token has correct bucket permissions
2. Check Access Key ID and Secret are correct
3. Verify endpoint URL format

---

## Environment Example

Complete `.env` for Cloudflare setup:

```bash
NODE_ENV=production
PORT=3000
SITE_URL=https://git.yourdomain.com

# Database (local PostgreSQL)
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://opencodehub:password@localhost:5432/opencodehub

# Security
JWT_SECRET=<64-char-hex>
SESSION_SECRET=<64-char-hex>
INTERNAL_HOOK_SECRET=<64-char-hex>

# Cloudflare R2 Storage
STORAGE_TYPE=s3
STORAGE_BUCKET=opencodehub-repos
STORAGE_REGION=auto
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY=<r2-access-key>
S3_SECRET_KEY=<r2-secret-key>
```

---

## Next Steps

- [Configure monitoring](/administration/monitoring/)
- [Set up backups](/administration/deploy-docker/#backup--restore)
- [Enable AI code review](/features/ai-review/)
