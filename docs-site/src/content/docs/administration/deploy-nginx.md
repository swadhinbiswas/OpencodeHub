---
title: "Deploy with Nginx"
description: "Configure Nginx as a reverse proxy for OpenCodeHub with SSL and Git optimizations"
---

Nginx is the recommended reverse proxy for OpenCodeHub in production. This guide covers complete configuration including SSL, Git-specific optimizations, and performance tuning.

## Prerequisites

- Nginx 1.18+ installed
- Domain name with DNS configured
- OpenCodeHub running on `localhost:3000`

```bash
# Install Nginx (Ubuntu/Debian)
sudo apt update
sudo apt install -y nginx

# Install Nginx (Fedora/RHEL)
sudo dnf install -y nginx

# Start and enable
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## Basic Configuration

### Minimal Reverse Proxy

```nginx
# /etc/nginx/sites-available/opencodehub
server {
    listen 80;
    server_name git.yourcompany.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/opencodehub /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## SSL Setup with Let's Encrypt

### Install Certbot

```bash
# Ubuntu/Debian
sudo apt install -y certbot python3-certbot-nginx

# Fedora/RHEL
sudo dnf install -y certbot python3-certbot-nginx
```

### Obtain Certificate

```bash
sudo certbot --nginx -d git.yourcompany.com
```

Certbot will automatically configure SSL in your Nginx config.

### Manual SSL Configuration

If you prefer manual setup or have existing certificates:

```nginx
server {
    listen 80;
    server_name git.yourcompany.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name git.yourcompany.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/git.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/git.yourcompany.com/privkey.pem;
    
    # Modern SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_stapling on;
    ssl_stapling_verify on;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Production Configuration

Complete production-ready configuration:

```nginx
# /etc/nginx/sites-available/opencodehub

# Upstream for load balancing (optional)
upstream opencodehub {
    server localhost:3000;
    keepalive 64;
}

# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=git:10m rate=5r/s;

# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name git.yourcompany.com;
    return 301 https://$host$request_uri;
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name git.yourcompany.com;

    # SSL
    ssl_certificate /etc/letsencrypt/live/git.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/git.yourcompany.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Logging
    access_log /var/log/nginx/opencodehub.access.log;
    error_log /var/log/nginx/opencodehub.error.log;

    # Git operations (larger limits and timeouts)
    location ~ ^/[^/]+/[^/]+\.git/ {
        # Rate limiting for git operations
        limit_req zone=git burst=10 nodelay;

        # Large file support (for push)
        client_max_body_size 500M;
        
        # Extended timeouts for large repos
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_connect_timeout 60s;
        
        # Buffer settings for packfiles
        proxy_buffer_size 128k;
        proxy_buffers 8 256k;
        proxy_busy_buffers_size 256k;
        
        # Disable buffering for real-time output
        proxy_request_buffering off;
        
        proxy_pass http://opencodehub;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API endpoints
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://opencodehub;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support (for live updates)
    location /ws {
        proxy_pass http://opencodehub;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Static files (if serving separately)
    location /_astro/ {
        proxy_pass http://opencodehub;
        proxy_cache_valid 200 1d;
        add_header Cache-Control "public, max-age=86400";
    }

    # Default location
    location / {
        proxy_pass http://opencodehub;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Performance Tuning

### Worker Configuration

```nginx
# /etc/nginx/nginx.conf

worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    # Basic settings
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript;

    # Include site configs
    include /etc/nginx/sites-enabled/*;
}
```

---

## Common Issues

### 413 Request Entity Too Large

Increase `client_max_body_size`:

```nginx
location ~ ^/[^/]+/[^/]+\.git/ {
    client_max_body_size 500M;
    # ...
}
```

### 504 Gateway Timeout

Increase proxy timeouts for large operations:

```nginx
proxy_read_timeout 600s;
proxy_send_timeout 600s;
```

### WebSocket Connection Drops

Ensure WebSocket headers are set:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

---

## Load Balancing Multiple Instances

```nginx
upstream opencodehub {
    least_conn;
    server 10.0.0.1:3000 weight=5;
    server 10.0.0.2:3000 weight=5;
    server 10.0.0.3:3000 backup;
    keepalive 64;
}
```

---

## Monitoring

### Enable Nginx Status

```nginx
server {
    listen 127.0.0.1:8080;
    
    location /nginx_status {
        stub_status on;
        allow 127.0.0.1;
        deny all;
    }
}
```

Access metrics: `curl http://127.0.0.1:8080/nginx_status`

---

## Next Steps

- [Configure OpenCodeHub for production](/administration/deployment/)
- [Set up monitoring with Grafana](/administration/monitoring/)
- [Configure backups](/administration/deploy-docker/#backup--restore)
