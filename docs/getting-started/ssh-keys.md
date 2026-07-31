---
title: "SSH Keys & Deploy Keys"
description: "How to set up SSH keys for secure Git operations and deploy keys for CI/CD"
---

# SSH Keys & Deploy Keys

OpenCodeHub supports SSH key authentication for secure Git operations without passwords.

## SSH Keys (Account-Level)

SSH keys give you access to **all your repositories**. Use them for daily development.

### Generating an SSH Key

**Ed25519 (recommended):**
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

**RSA (legacy):**
```bash
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
```

### Adding Your Key

1. Copy your public key:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```

2. Go to **Settings → SSH Keys** in OpenCodeHub

3. Click **New SSH Key**

4. Paste your public key and give it a title (e.g., "Work Laptop")

### Testing Your Connection

```bash
ssh -T git@your-server.com
```

You should see: `Hi username! You've successfully authenticated`

> **Note:** Replace `your-server.com` with your actual OpenCodeHub server hostname or IP address.

### Using SSH with Git

```bash
# Clone via SSH
git clone git@your-server.com:owner/repo.git

# Add SSH remote to existing repo
git remote add origin git@your-server.com:owner/repo.git
```

## Deploy Keys (Repository-Level)

Deploy keys grant access to a **single repository**. Use them for CI/CD and deployments.

### When to Use Deploy Keys

- CI/CD pipelines that need to pull code
- Deployment servers
- Automation scripts with limited access

### Generating a Deploy Key

```bash
ssh-keygen -t ed25519 -C "deploy@production-server"
```

### Adding a Deploy Key

1. Go to **Repository → Settings → Deploy Keys**

2. Click **Add deploy key**

3. Paste the public key and give it a title

4. Choose **Read-only** or **Read/write** access

### Key Differences

| Feature | SSH Keys | Deploy Keys |
|---------|----------|-------------|
| Scope | All repositories | Single repository |
| Access | Full account access | Read-only or read/write |
| Use case | Daily development | CI/CD, deployment |

## Troubleshooting

### Permission Denied

```bash
# Check SSH agent
ssh-add -l

# Add key to agent
ssh-add ~/.ssh/id_ed25519

# Debug SSH connection
ssh -vvv git@your-server.com
```

### Wrong Key Being Used

```bash
# Specify key explicitly
ssh -i ~/.ssh/id_ed25519 git@your-server.com
```

### Host Key Verification Failed

```bash
# Add host to known_hosts
ssh-keyscan your-server.com >> ~/.ssh/known_hosts
```
