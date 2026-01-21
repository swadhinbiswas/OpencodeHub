---
title: "Create Your First Repository"
---


This guide walks you through the complete lifecycle of a repository in OpenCodeHub.

## Step 1: Creation

1. Click the **+** button in the top navbar and select **New Repository**.
2. **Owner**: Select yourself or an organization.
3. **Repository Name**: Enter `hello-world`.
4. **Description**: "My first project on OpenCodeHub".
5. **Visibility**: Select **Public**.
6. **Initialize**: Check **Initialize with README**.

Click **Create Repository**. You'll be taken to your new repository's home page.

## Step 2: Cloning

To work on your computer, you need to clone the repository.

### SSH (Recommended)
Ensure you have added your SSH key in **Settings > SSH Keys**.

```bash
git clone git@your-instance.com:username/hello-world.git
```

### HTTPS
```bash
git clone https://your-instance.com/username/hello-world.git
```

## Step 3: Making Changes

Open the folder in your favorite editor (VS Code, etc.).

```bash
cd hello-world
```

Modify `README.md`:
```markdown
# Hello World
This is my first change!
```

Commit the change:
```bash
git add README.md
git commit -m "Update README"
```

## Step 4: Pushing

Push your changes back to OpenCodeHub:

```bash
git push origin main
```
(Or use `och push` if you installed the CLI).

## Step 5: Viewing Changes

Refresh your repository page in the browser. You should see your updated `README.md` displayed and the latest commit listed.

Congratulations! You've successfully hosted code on OpenCodeHub.
