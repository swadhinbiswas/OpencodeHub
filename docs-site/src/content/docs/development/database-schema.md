---
title: "Database Schema"
---


The database schema is defined using Drizzle ORM in `drizzle/schema.ts`.

## Core Tables

- **users**: Stores user accounts, hashed passwords, and profile info.
- **repositories**: Stores repository metadata (owner, name, visibility).
- **pull_requests**: Stores PR data, status, and description.
- **sessions**: Stores active login sessions (if using database sessions).

## Migrations

We use `drizzle-kit` for migrations.

**Generate a migration:**
```bash
npm run db:generate
```

**Apply migrations:**
```bash
npm run db:migrate
```

**Push schema (Prototyping):**
```bash
npm run db:push
```
