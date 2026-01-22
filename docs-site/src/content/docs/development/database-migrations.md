---
title: "Database Migrations"
description: "How to generate, apply, and inspect schema changes."
---

OpenCodeHub uses Drizzle for schema management.

## Generate migrations

```bash
npm run db:generate
```

Generates SQL migrations from the current schema.

## Apply migrations

```bash
npm run db:migrate
```

Applies pending migrations to the configured database.

## Push schema (dev)

```bash
npm run db:push
```

Pushes schema changes directly (useful for local development).

## Inspect schema

```bash
npm run db:studio
```

Opens the Drizzle Studio UI for inspecting tables.
