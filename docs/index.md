# OpenCodeHub Documentation

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/swadhinbiswas/OpenCodeHub/main/public/logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/swadhinbiswas/OpenCodeHub/main/public/logo-light.png">
    <img src="https://raw.githubusercontent.com/swadhinbiswas/OpenCodeHub/main/public/logo-light.png" alt="OpenCodeHub Logo" width="400">
  </picture>
</p>

> Everything you need to know about OpenCodeHub - from getting started to advanced features

Welcome to OpenCodeHub's comprehensive documentation. Whether you're new to the platform or looking to master advanced features, you'll find everything you need here.

---

## 🚀 Quick Links

<div class="quick-links">
  <a href="#getting-started">
    <h3>🎯 Getting Started</h3>
    <p>Install and set up OpenCodeHub in 5 minutes</p>
  </a>

  <a href="#features">
    <h3>✨ Features</h3>
    <p>Learn about stacked PRs, AI review, and more</p>
  </a>

  <a href="#tutorials">
    <h3>📚 Tutorials</h3>
    <p>Hands-on guides to master OpenCodeHub</p>
  </a>

  <a href="#api">
    <h3>🔌 API Reference</h3>
    <p>Integrate with OpenCodeHub programmatically</p>
  </a>
</div>

---

## 📖 Documentation Sections

### Getting Started

New to OpenCodeHub? Start here!

- **[Installation Guide](getting-started/installation.md)** - Set up OpenCodeHub (Docker or manual)
- **[Quick Start](getting-started/quick-start.md)** - Get up and running in 5 minutes
- **[Create Your First Repository](getting-started/first-repository.md)** - Push your first code

### Core Features

Learn about OpenCodeHub's powerful features:

- **[Stacked Pull Requests](features/stacked-prs.md)** ⭐
  Break large changes into reviewable stacks. Ship code faster.

- **[AI Code Review](features/ai-review.md)** 🤖
  Get instant feedback from GPT-4 or Claude. Catch bugs automatically.

- **[Smart Merge Queue](features/merge-queue.md)** 🔀
  Automate merging with stack-aware CI optimization.

- **[Developer Metrics](features/developer-metrics.md)** 📊
  Track velocity, review efficiency, and team performance.

- **[Slack Integration](features/slack-integration.md)** 💬
  Get actionable notifications in Slack. Review without leaving chat.

- **[CI/CD Pipelines](features/ci-cd.md)** ⚙️
  GitHub Actions-compatible workflows. Build, test, deploy.

### Hands-On Tutorials

Step-by-step guides to master OpenCodeHub:

- **[Your First Stacked PR](tutorials/your-first-stack.md)** 🎓
  15-minute tutorial: Create your first stack of PRs

- **[AI-Powered Code Reviews](tutorials/ai-powered-reviews.md)**
  Set up and use AI review for your projects

- **[Automated Deployment](tutorials/automated-deployment.md)**
  Build a complete CI/CD pipeline from scratch

### Guides

Best practices and workflows:

- **[Team Workflows](guides/team-workflows.md)** - Collaborate effectively
- **[Branch Protection](guides/branch-protection.md)** - Secure your branches
- **[Webhooks](guides/webhooks.md)** - Integrate with external services
- **[Storage Adapters](guides/storage-adapters.md)** - Configure S3, GCS, or local storage

### API Reference

Integrate OpenCodeHub into your tools:

- **[REST API](api/rest-api.md)** - Complete API reference
- **[Webhooks](api/webhooks-api.md)** - Event-driven integrations
- **[Authentication](api/authentication.md)** - API tokens and OAuth

### Administration

For system administrators:

- **[Deployment Guide](administration/deployment.md)** - Production deployment
- **[Configuration Reference](administration/configuration.md)** - All config options
- **[Security Best Practices](administration/security.md)** - Secure your instance
- **[Monitoring](administration/monitoring.md)** - Monitor health and performance

### Development

Contributing to OpenCodeHub:

- **[Architecture](development/architecture.md)** - System design components
- **[Database Schema](development/database-schema.md)** - Database tables
- **[Contributing](development/contributing.md)** - Dev environment setup
- **[Testing](development/testing.md)** - Running tests

### Reference & Support

- **[CLI Commands](reference/cli-commands.md)** - Full CLI reference
- **[Glossary](reference/glossary.md)** - Project terminology
- **[Troubleshooting](support/troubleshooting.md)** - Fix common issues

---

## 🎯 Popular Topics

### Stacked Pull Requests

The #1 feature that makes OpenCodeHub unique:

```
main branch
 └── PR #123: Add database schema ✅
      └── PR #124: Add auth service  🔍
           └── PR #125: Add login UI ⏳
```

- [What are Stacked PRs?](features/stacked-prs.md#why-stacked-prs)
- [Create your first stack](tutorials/your-first-stack.md)
- [CLI reference](../cli/README.md)

### AI Code Review

Catch bugs before they reach production:

```python
# AI Review finds:
# 🔴 CRITICAL: SQL injection on line 45
# 🟡 WARNING: N+1 query on line 128
# 🔵 INFO: Consider error handling on line 87
```

- [Setup AI review](features/ai-review.md#setup)
- [Understanding output](features/ai-review.md#understanding-review-output)
- [Cost optimization](features/ai-review.md#cost-considerations)

### Merge Queue

Merge automatically, in the right order:

```bash
och queue add 123 124 125
# → Queue handles everything:
#    - CI runs
#    - Rebasing
#    - Merging in order
#    - Zero manual work
```

- [How it works](features/merge-queue.md#how-it-works)
- [Queue configuration](features/merge-queue.md#configuration)
- [Best practices](features/merge-queue.md#best-practices)

---

## 🔧 Installation

### Quick Start (Docker)

```bash
# 1. Download docker-compose.yml
curl -O https://raw.githubusercontent.com/swadhinbiswas/OpencodeHub/main/docker-compose.yml

# 2. Configure
cp .env.example .env
# Edit .env with your settings

# 3. Start
docker-compose up -d

# 4. Create admin user
docker-compose exec app bun run scripts/seed-admin.ts

# 5. Open
open http://localhost:3000
```

[Full installation guide →](getting-started/installation.md)

### Requirements

- **Docker**: 20.10+ (recommended)
- **OR Node.js**: 18+ with Bun or npm
- **Database**: PostgreSQL 14+ or SQLite
- **Storage**: Local, S3, Google Cloud Storage, or Azure Blob

---

## 🎓 Learning Paths

### For Developers

1. [Quick Start](getting-started/quick-start.md) - Get familiar with the platform
2. [Your First Stack](tutorials/your-first-stack.md) - Learn stacked PRs
3. [Team Workflows](guides/team-workflows.md) - Collaborate effectively

### For Teams

1. [Installation](getting-started/installation.md) - Set up your instance
2. [Team Workflows](guides/team-workflows.md) - Define your process
3. [Branch Protection](guides/branch-protection.md) - Secure your code
4. [CI/CD Setup](features/ci-cd.md) - Automate everything

### For Administrators

1. [Deployment Guide](administration/deployment.md) - Production setup
2. [Security Best Practices](administration/security.md) - Secure your instance
3. [Monitoring](administration/monitoring.md) - Track health
4. [Configuration](administration/configuration.md) - Tune performance

---

## 💬 Community & Support

### Get Help

- **📖 Documentation** - You're here!
- **💬 [Discord](https://discord.gg/opencodehub)** - Real-time chat, community support
- **🐛 [GitHub Issues](https://github.com/swadhinbiswas/OpencodeHub/issues)** - Bug reports, feature requests
- **📧 [Email Support](mailto:support@opencodehub.com)** - Direct support

### Contributing

We welcome contributions!

- **[Contributing Guide](development/contributing.md)** - How to contribute
- **[Good First Issues](https://github.com/swadhinbiswas/OpencodeHub/labels/good-first-issue)** - Easy issues for new contributors
- **[Roadmap](https://github.com/swadhinbiswas/OpencodeHub/projects)** - What's coming next

---

## 📝 Recent Updates

### December 2024

- ✨ Added AI code review with GPT-4 and Claude support
- 🚀 Improved merge queue performance (60% faster)
- 📊 New developer metrics dashboard
- 🔧 100+ bug fixes and improvements

[Full changelog →](../CHANGELOG.md)

---

## 🌟 Why OpenCodeHub?

| Feature           | GitHub          | GitLab     | OpenCodeHub       |
| ----------------- | --------------- | ---------- | ----------------- |
| Stacked PRs       | ❌              | ❌         | ✅ Native support |
| AI Code Review    | ⚠️ Copilot only | ❌         | ✅ GPT-4 & Claude |
| Smart Merge Queue | ⚠️ Basic        | ⚠️ Basic   | ✅ Stack-aware    |
| Self-Hosted       | ❌              | ✅ Complex | ✅ Simple         |
| Cost              | $$$             | $$$        | Free              |

---

## 🔍 Search Documentation

Can't find what you're looking for?

- Use the search bar above
- Check the [FAQ](#faq)
- Ask in [Discord](https://discord.gg/opencodehub)
- Browse [GitHub Discussions](https://github.com/swadhinbiswas/OpencodeHub/discussions)

---

## 📄 License

OpenCodeHub is open source under the MIT License.

[View license →](../LICENSE)

---

**Ready to get started?**

[Install OpenCodeHub →](getting-started/installation.md) | [Quick Start →](getting-started/quick-start.md) | [Your First Stack →](tutorials/your-first-stack.md)
