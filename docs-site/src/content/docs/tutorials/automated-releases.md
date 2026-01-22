---
title: "Automated Releases"
description: "Tag, generate notes, and publish releases with the CLI."
---

This tutorial shows a simple release flow using the CLI.

## 1) Create a tag and release

```bash
och release create v1.2.0 --title "1.2.0" --generate-notes
```

Use `--draft` for internal review or `--prerelease` for pre‑release builds.

## 2) Verify release

```bash
och release view v1.2.0
```

## 3) List releases

```bash
och release list
```

## 4) Remove a release (if needed)

```bash
och release delete v1.2.0
```

## Optional: tie to CI

Create a `.github/workflows/release.yml` that tags and calls the CLI once tests pass.
