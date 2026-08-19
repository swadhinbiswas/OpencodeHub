# OpenCodeHub Community Hub

Federated discovery hub for self-hosted **OpenCodeHub** instances. Anyone who hosts OpenCodeHub can submit their URL — the hub probes `GET /api/instance`, fetches `GET /api/repos?visibility=public`, caches public repos & profiles in **Turso** (LibSQL), and displays them with a beautiful, responsive **Tailwind + shadcn/ui** interface. Community users can star and follow; cloning/contributing requires your own node via federation.

## Stack
- **Framework:** Astro 4 + React 18 (SSR, `@astrojs/node` standalone)
- **UI:** Tailwind CSS 3 + shadcn/ui (Radix) + lucide-react, dark mode, fully responsive
- **DB:** Turso (LibSQL) via Drizzle ORM (`drizzle-orm` + `@libsql/client`) — `community_users`, `instances`, `cached_repos`, `cached_users`, `stars`, `follows`
- **Cache:** Upstash Redis (`@upstash/redis`) with in-memory fallback (30s–1h TTLs)
- **Auth:** Community JWT (jose + bcryptjs), cookie `community_session` (7d)

## How it works
1. **Submit URL** at `/instances/submit` — we `fetch(origin + "/api/instance")` (8s timeout) and verify `data.product === "opencodehub"`.
2. **Aggregate** — paginated `GET /api/repos?visibility=public&sort=updated` (100/page), plus owner metadata for profiles. No private data is ever fetched or stored.
3. **Display** — Explore shows trending repos, languages, profiles, instance cards. Each repo card shows `fullName`, `description`, `language`, `starCount`, `httpCloneUrl`, and the source instance badge.
4. **Engage** — Logged-in Community users can **star** repos and **follow** profiles (rows in Turso); counts are community-local and do not mutate the remote instance.
5. **Contribute** — "Clone via `httpCloneUrl`" requires your own OpenCodeHub node. Push to your instance and open a cross-instance PR (federation `POST /api/repos/{owner}/{repo}/external-pulls`) — no central gatekeeper.

### Instance submission SSRF
Mirrors `src/lib/url-validator.ts` from the main app: only `http/https` origins, block `localhost/private` unless `FEDERATION_ALLOW_LOCALHOST=true` (local two-instance testing).

## Setup
```bash
cp .env.example .env
# set TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, JWT_SECRET, UPSTASH_… , SITE_URL
npm install
npm run db:push   # push Drizzle schema to Turso
npm run dev       # http://localhost:4322
npm run build && npm run start
```

## Env
See `.env.example`. For local dev Turso can be `file:./data/community.db` (no token).

## Pages
- `/` — hero + how it works + CTA
- `/explore` — trending repos, languages, profiles (searchable)
- `/instances` — submitted nodes (InstanceCard grid)
- `/instances/submit` — verify & submit flow (`POST /api/instances/submit`)
- `/auth/login` & `/auth/register` — Community auth (Turso)

## API (Community)
- `POST /api/instances/submit` — `{url}` → probe + upsert instance
- `GET /api/instances` — list instances

Remote fetch uses `User-Agent: CommunityHub/1.0` and respects `Retry-After` on 429. Cache keys: `instance:{id}:probe` (1h), `instance:{id}:repos:page:{n}` (5m).

## Deploy
Any Node host / Docker + `SITE_URL` + Turso + Upstash. For Turso edge, swap adapter to `@astrojs/vercel` if needed.
