# OpenCodeHub Community Hub

Federated discovery hub for self-hosted **OpenCodeHub** instances. Anyone who hosts OpenCodeHub can submit their URL — the hub probes `GET /api/instance`, fetches `GET /api/repos?visibility=public`, caches public repos & profiles in **Turso** (LibSQL), and displays them with a beautiful, responsive **Tailwind + shadcn/ui** interface. Community users can star and follow; cloning/contributing requires your own node via federation.

## Stack
- **Framework:** Astro 4 + React 18 (SSR, `@astrojs/node` standalone)
- **UI:** Tailwind CSS 3 + shadcn/ui (Radix) + lucide-react, dark mode, fully responsive
- **DB:** Turso (LibSQL) via Drizzle ORM — `community_users`, `instances`, `cached_repos`, `cached_users`, `stars`, `follows`
- **Cache:** Upstash Redis (`@upstash/redis`) with in-memory fallback (30s–1h TTLs)
- **Auth:** Community JWT (jose + bcryptjs), cookie `community_session` (7d)

## Setup

### 1. Create a Turso database
1. Sign up at [turso.tech](https://turso.tech/dashboard)
2. Create a new database (e.g. `community-hub`)
3. Copy the database URL (looks like `libsql://community-hub-your-org.turso.io`)
4. Create an auth token (Settings → Auth Tokens → Create)

### 2. Configure
```bash
cd community
cp .env.example .env
# Edit .env and set:
#   TURSO_DATABASE_URL=libsql://your-db-name-your-org.turso.io
#   TURSO_AUTH_TOKEN=your-token-here
#   JWT_SECRET=any-random-secret
#   UPSTASH_REDIS_REST_URL=https://... (optional)
#   UPSTASH_REDIS_REST_TOKEN=... (optional)
```

### 3. Push schema & run
```bash
npm install
npm run db:push       # Push Drizzle schema to Turso
npm run dev           # http://localhost:4322
```

### 4. Production
```bash
npm run build
npm run start
```

## How it works
1. **Submit URL** at `/instances/submit` — we probe `GET /api/instance` and verify `data.product === "opencodehub"`.
2. **Aggregate** — paginated `GET /api/repos?visibility=public&sort=updated` (100/page), plus owner metadata for profiles. Only public data is fetched.
3. **Display** — Explore shows trending repos, languages, profiles, instance cards. Each repo card shows `fullName`, `description`, `language`, `starCount`, `httpCloneUrl`, and the source instance badge.
4. **Engage** — Logged-in Community users can **star** repos and **follow** profiles (rows in Turso); counts are community-local and do not mutate the remote instance.
5. **Contribute** — "Clone via `httpCloneUrl`" requires your own OpenCodeHub node. Push to your instance and open a cross-instance PR (federation).

## API
- `POST /api/instances/submit` — `{url}` → probe + upsert instance
- `GET /api/instances` — list instances
- `POST /api/instances/sync?id=` — fetch public repos from instance, cache in Turso
- `POST /api/stars` — toggle star on a cached repo
- `POST /api/follows` — toggle follow on a profile

## Pages
- `/` — hero + how it works + CTA
- `/explore` — trending repos, languages, profiles (searchable)
- `/instances` — submitted nodes (InstanceCard grid)
- `/instances/submit` — verify & submit flow
- `/instances/[id]` — instance detail with live sync
- `/u/[username]` — profile + contribution matrix
- `/r/[instance]/[owner]/[repo]` — repo detail, clone URLs, contribute flow
- `/auth/login` & `/auth/register` — Community auth

## Deploy
Any Node host + Turso + Upstash (optional). For Turso edge, swap adapter to `@astrojs/vercel` if needed.
