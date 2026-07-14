---
title: "Quick Start Guide"
---

Welcome to OpenCodeHub! This guide will help you get started in minutes.

## 1. Login

Navigate to your instance URL (e.g., `http://localhost:4321`) and log in with the admin credentials you created during installation.

## 2. Create a Repository

1. Click the **+** icon in the top navigation bar
2. Select **New Repository**
3. Enter a name (e.g., `my-project`)
4. Choose visibility: **Public** or **Private**
5. Optionally initialize with a README
6. Click **Create Repository**

## 3. Push Code

```bash
# Clone your new repository
git clone https://git.yourcompany.com/your-username/my-project.git
cd my-project

# Add your code
echo "# My Project" > README.md
git add .
git commit -m "Initial commit"
git push -u origin main
```

Or use SSH:

```bash
git clone ssh://git@your-server:2222/your-username/my-project.git
```

## 4. Explore the Dashboard

Your dashboard shows:
- **Recent Repositories** you've worked on
- **Pull Requests** requiring your attention
- **Stacked PRs** if you're using the stack workflow
- **Activity Feed** from your team

## 5. Create a Pull Request

1. Navigate to your repository
2. Click **Pull Requests** → **New Pull Request**
3. Select source and target branches
4. Add a title and description
5. Click **Create Pull Request**

See [First Repository](/getting-started/first-repository/) for a complete walkthrough.

## 6. Try Key Features

### Stacked PRs
Break large changes into reviewable stacks:
```bash
# Install the CLI
npm install -g opencodehub-cli

# Login
och auth login

# Create a stacked branch
och stack create feature/part-1

# Make changes, commit, push
och stack submit
```

### AI Code Review
Enable in **Settings** → **AI Review**. Configure your preferred provider (OpenAI, Anthropic, etc.) and AI will automatically review PRs for bugs and security issues.

### Merge Queue
Add PRs to the merge queue from the PR page. The queue ensures `main` never breaks by running CI on the merged result before pushing.

### CI/CD Pipelines
Create `.github/workflows/*.yml` files in your repository. OpenCodeHub uses GitHub Actions-compatible syntax.

## 7. Install the CLI

```bash
npm install -g opencodehub-cli

# Authenticate
och auth login --url https://git.yourcompany.com

# Check status
och status
```

See [CLI Overview](/reference/cli-overview/) for all commands.

## Next Steps

- **[First Repository](/getting-started/first-repository/)** — Complete repository lifecycle
- **[Stacked PRs](/features/stacked-prs/)** — Learn the stack workflow
- **[CLI Reference](/reference/cli-commands/)** — All CLI commands
- **[Configuration](/administration/configuration/)** — Customize your instance
