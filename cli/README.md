<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/swadhinbiswas/OpenCodeHub/main/public/logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/swadhinbiswas/OpenCodeHub/main/public/logo-light.png">
    <img src="https://raw.githubusercontent.com/swadhinbiswas/OpenCodeHub/main/public/logo-light.png" alt="OpenCodeHub CLI" width="400" />
  </picture>
</p>

<h1 align="center">OpenCodeHub CLI</h1>

<p align="center">
  <strong>🎨 Production-grade Git workflows with beautiful UI</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencodehub-cli"><img src="https://img.shields.io/npm/v/opencodehub-cli.svg?style=flat-square" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/opencodehub-cli"><img src="https://img.shields.io/npm/dm/opencodehub-cli.svg?style=flat-square" alt="npm downloads" /></a>
  <a href="https://github.com/swadhinbiswas/OpencodeHub/blob/main/cli/LICENSE"><img src="https://img.shields.io/npm/l/opencodehub-cli.svg?style=flat-square" alt="license" /></a>
  <a href="https://github.com/swadhinbiswas/OpencodeHub"><img src="https://img.shields.io/github/stars/swadhinbiswas/OpenCodeHub?style=flat-square" alt="GitHub stars" /></a>
</p>

<p align="center">
  <a href="#-installation">Installation</a> •
  <a href="#-features">Features</a> •
  <a href="#-commands">Commands</a> •
  <a href="#-examples">Examples</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

## ✨ Features

- 🎨 **Beautiful UI** - GitHub-like progress indicators, ASCII art, and colored output
- 📦 **Git Push/Pull** - Fast repository operations with real-time progress
- 🚀 **Simple Commands** - `och push`, `och clone`, `och create` - that's it!
- 📊 **Progress Tracking** - See object enumeration, compression, and upload speeds
- 🎯 **Production Ready** - Professional output that rivals GitHub's CLI
- ✨ **Spinners & Boxes** - Beautiful feedback for every operation

## 📦 Installation

```bash
# Install globally with npm
npm install -g opencodehub-cli

# Or with yarn
yarn global add opencodehub-cli

# Or with pnpm
pnpm add -g opencodehub-cli

# Verify installation
och --version
```

## 🚀 Quick Start

```bash
# 1. Login to your OpenCodeHub instance
och auth login

# 2. Navigate to your repository
cd your-repo

# 3. Push code with beautiful progress indicators
och push -b master

# That's it! 🎉
```

## 📖 Commands

### Authentication

```bash
# Interactive login
och auth login

# Login with token (for CI/CD)
och auth login --token YOUR_TOKEN

# Check current user
och auth whoami

# Logout
och auth logout
```

### Repository Operations

```bash
# Push current repository
och push                    # Push current branch
och push -b feature-branch  # Push specific branch
och push --force           # Force push

# Clone a repository
och clone owner/repo       # Clone to ./repo
och clone owner/repo mydir # Clone to ./mydir

# Create new repository
och create myrepo                    # Create public repo
och create myrepo --private          # Create private repo
och create myrepo --description "..." # With description

# List repositories
och repo list
```

## 🎨 Beautiful Output Examples

### Push Command

```
ℹ Pushing to swadhinbiswas/myrepo
  Branch: master

✔ Objects prepared
  Enumerating objects: 159, done.
  Counting objects: 100% (159/159), done.
  Delta compression using up to 20 threads
  Compressing objects: 100% (76/76), done.
  Writing objects: 100% (90/90), 49.17 KiB | 8.20 MiB/s, done.
  Total 90 (delta 45), reused 0 (delta 0), pack-reused 0

✔ Uploaded 49.17 KB in 0.52s (94.56 KB/s)

remote: Processing: 100% (90/90), done.
remote:
To https://opencodehub.com/swadhinbiswas/myrepo.git
   abc1234..def5678  master -> master

╭─────────────────────────────────────────╮
│                                         │
│   ✨ Push Successful!                  │
│                                         │
│   Repository: swadhinbiswas/myrepo      │
│   Branch: master                        │
│   Size: 49.17 KB                        │
│                                         │
│   View at: https://opencodehub.com/... │
│                                         │
╰─────────────────────────────────────────╯
```

### Clone Command

```
ℹ Cloning swadhinbiswas/awesome-project

✔ Repository found

→ Cloning into awesome-project/...
Cloning into 'awesome-project'...
remote: Enumerating objects: 234, done.
remote: Total 234 (delta 0), reused 0 (delta 0)
Receiving objects: 100% (234/234), 1.23 MiB | 2.45 MiB/s, done.

╭─────────────────────────────────────────╮
│                                         │
│   ✨ Clone Successful!                  │
│                                         │
│   Repository: swadhinbiswas/project     │
│   Location: awesome-project/            │
│                                         │
│   cd awesome-project && och push        │
│                                         │
╰─────────────────────────────────────────╯
```

### Create Command

```
ℹ Creating 🌐 my-new-repo
  Description: An awesome new project

✔ Repository created

    ✨ SUCCESS! ✨

    Repository swadhinbiswas/my-new-repo is ready!

╭─────────────────────────────────────────╮
│                                         │
│   🎉 Repository Created!                 │
│                                         │
│   Repository: swadhinbiswas/my-new-repo │
│   Visibility: 🌐 Public                 │
│   Description: An awesome new project   │
│                                         │
│   Clone URL: https://...                │
│                                         │
│   ✓ Added remote 'opencode'             │
│                                         │
│   View at: https://opencodehub.com/... │
│                                         │
╰─────────────────────────────────────────╯
```

## 🔧 CI/CD Usage

```yaml
# .github/workflows/deploy.yml
name: Deploy

on: push

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install CLI
        run: npm install -g opencodehub-cli

      - name: Push to OpenCodeHub
        run: |
          och auth login --token ${{ secrets.OCH_TOKEN }}
          och push -b main
```

## ⚙️ Configuration

OCH CLI stores configuration in `~/.ochrc`.

```bash
# View current configuration
och config list

# Set server URL
och config set serverUrl https://git.yourcompany.com

# Set default branch
och config set defaultBranch main
```

## 🎨 UI Features

- **ASCII Art Logos** - Gradient-colored branding
- **Progress Indicators** - GitHub-style object counting and compression
- **Upload Speeds** - Real-time speed indicators
- **Colored Output** - Green for success, red for errors, cyan for info
- **Spinners** - Smooth animations for long operations
- **Boxed Messages** - Beautiful bordered success/error boxes
- **Ref Updates** - Color-coded branch update notifications

## 📦 What's New in v1.1.0

✨ **Production-Grade UI Overhaul**

- GitHub-like progress indicators
- Beautiful ASCII art and gradients
- Real-time upload/download speeds
- Professional boxed messages
- Color-coded output throughout

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](https://github.com/swadhinbiswas/OpencodeHub/blob/main/CONTRIBUTING.md).

```bash
# Clone the repo
git clone https://github.com/swadhinbiswas/OpencodeHub.git
cd OpenCodeHub/cli

# Install dependencies
npm install

# Build
npm run build

# Run in development
npm run dev
```

## 📝 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🔗 Links

- [OpenCodeHub](https://github.com/swadhinbiswas/OpencodeHub) - The main project
- [Documentation](https://github.com/swadhinbiswas/OpencodeHub#readme)
- [Report Issues](https://github.com/swadhinbiswas/OpencodeHub/issues)
- [npm Package](https://www.npmjs.com/package/opencodehub-cli)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/swadhinbiswas">Swadhin Biswas</a>
</p>
