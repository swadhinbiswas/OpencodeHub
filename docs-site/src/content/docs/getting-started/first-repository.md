---
title: "Create Your First Repository"
---

This guide walks you through the complete lifecycle of a repository in OpenCodeHub.

## Step 1: Create the Repository

1. Click the **+** button in the top navbar → **New Repository**
2. **Owner**: Select yourself or an organization
3. **Repository Name**: Enter `hello-world`
4. **Description**: "My first project on OpenCodeHub"
5. **Visibility**: Select **Public**
6. **Initialize**: Check **Initialize with README**

Click **Create Repository**.

## Step 2: Clone

### SSH (Recommended)

Add your SSH key in **Settings → SSH Keys** first.

```bash
git clone ssh://git@your-server:2222/username/hello-world.git
```

### HTTPS

```bash
git clone https://git.yourcompany.com/username/hello-world.git
```

For HTTPS, you'll need a Personal Access Token. Generate one at **Settings → Tokens**.

## Step 3: Make Changes

```bash
cd hello-world

# Edit files
echo "# Hello World\n\nThis is my first change!" > README.md

# Commit
git add README.md
git commit -m "Update README"
```

## Step 4: Push

```bash
git push origin main
```

Refresh the repository page to see your changes.

## Step 5: Create a Pull Request

1. Create a feature branch:
```bash
git checkout -b feat/add-feature
```

2. Make changes and push:
```bash
echo "New feature" > feature.txt
git add feature.txt
git commit -m "Add new feature"
git push -u origin feat/add-feature
```

3. In the web UI, go to **Pull Requests** → **New Pull Request**
4. Select `feat/add-feature` as source, `main` as target
5. Add a title and description
6. Click **Create Pull Request**

## Step 6: Review and Merge

1. Add reviewers on the PR page
2. Reviewers can approve or request changes
3. Once approved, click **Merge** or add to the **Merge Queue**

## Step 7: Explore Features

### Wiki
Go to the **Wiki** tab to create documentation for your project.

### Issues
Go to **Issues** → **New Issue** to track bugs and feature requests.

### Projects
Go to **Projects** to create a kanban board for task management.

### Actions
Go to **Actions** to view CI/CD pipeline runs. Create `.github/workflows/*.yml` files to set up automated builds.

### Settings
Go to **Settings** to configure:
- **Branch Protection** — Require reviews, status checks
- **Collaborators** — Add team members
- **Webhooks** — Integrations with external services
- **Deploy Keys** — SSH keys for automated deployments

## Next Steps

- **[Stacked PRs](/features/stacked-prs/)** — Break large changes into reviewable stacks
- **[AI Code Review](/features/ai-review/)** — Get automated code feedback
- **[CI/CD](/features/ci-actions/)** — Set up automated pipelines
- **[CLI](/reference/cli-overview/)** — Manage everything from the terminal
