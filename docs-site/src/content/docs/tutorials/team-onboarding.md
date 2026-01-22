---
title: "Team Onboarding"
description: "Invite teammates, protect branches, and set review standards."
---

This tutorial helps you bring a team onto a new OpenCodeHub instance.

## 1) Create a repository

Create a new repository from the UI and push your initial code.

## 2) Invite collaborators

In repository **Settings → Collaborators**, add team members and set access levels.

## 3) Set branch protection

Configure protections to enforce reviews and CI:

- Required approvals
- Block merges when CI fails
- Protect `main`

See [guides/branch-protection](../guides/branch-protection).

## 4) Enable stacked PRs

Share the stack workflow with your team:

```bash
npm install -g opencodehub-cli
och auth login --url https://your-instance
```

Then point them to [tutorials/your-first-stack](../tutorials/your-first-stack).

## 5) Automate reviews

Add an automation to trigger AI review on PR open:

```bash
och automate create
```

## 6) Align notifications

Encourage reviewers to enable notifications for review requests:

```bash
och notify settings --show
```
