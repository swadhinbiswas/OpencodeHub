---
title: "Usage Guide: Stacked Pull Requests"
description: "Master the art of stacking PRs to ship faster and smaller changes."
---

import { Steps, FileTree, Tabs, TabItem } from '@astrojs/starlight/components';

**Stacked Pull Requests** allow you to break down large features into smaller, dependent branches. Instead of one massive 1,000-line PR, you ship ten 100-line PRs that are easy to review and merge.

OpenCodeHub treats stacks as first-class citizens, providing native visualization and management tools that other platforms lack.

## Concept: The Stack

A "Stack" is simply a chain of git branches, where each branch depends on the one before it.

```mermaid
gitGraph
   commit
   branch main
   commit tag: "v1.0"
   branch feature/part-1
   checkout feature/part-1
   commit id: "feat: database schema"
   branch feature/part-2
   checkout feature/part-2
   commit id: "feat: api endpoints"
   branch feature/part-3
   checkout feature/part-3
   commit id: "feat: frontend ui"
```

In OpenCodeHub, when you merge `feature/part-1`, the system automatically rebases `feature/part-2` and `feature/part-3` onto `main`, keeping your history clean and valid.

## Using the CLI

The `och` CLI is the power tool for managing stacks.

<Steps>

1.  **Create your first branch**
    Start your stack by creating the bottom-most branch.

    ```bash
    git checkout -b feature/login-schema
    # ... write code ...
    git commit -am "feat: add users table"
    och push
    ```

    OpenCodeHub will detect this is a new branch and ask if you want to create a PR.

2.  **Stack on top**
    Without waiting for review, create the next branch immediately.

    ```bash
    och stack create feature/login-api
    # ... write code ...
    git commit -am "feat: add login endpoint"
    och push
    ```

    The CLI understands that `feature/login-api` depends on `feature/login-schema`.

3.  **Visualize the Stack**
    See the state of your entire stack in one view.

    ```bash
    och stack view
    ```

    **Output:**
    ```text
    (main)
      └─ feature/login-schema  [PR #101] (● Pending Review)
           └─ feature/login-api     [PR #102] (● Draft)
                └─ feature/login-ui      [PR #103] (● Draft)
    ```

</Steps>

## Server-Side features

When you view a PR that is part of a stack in OpenCodeHub's UI, you get special superpowers:

- **Stack Navigation**: A sidebar shows the full tree of related PRs.
- **Cascading Merge**: Merging the bottom PR triggers a "rebase chain" for all upstack PRs.
- **Unified CI**: You can run CI for the entire stack to ensure the final state is valid.
