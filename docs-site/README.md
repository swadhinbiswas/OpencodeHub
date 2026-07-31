# OpenCodeHub Documentation Site

The official documentation for [OpenCodeHub](https://github.com/swadhinbiswas/OpencodeHub) — an open-source, self-hosted Git platform with Stacked PRs, AI Code Review, and Smart Merge Queues. Built with [Astro Starlight](https://starlight.astro.build) and deployed to [Cloudflare Workers](https://workers.cloudflare.com).

**Live site:** <https://docs.opencodehub.space>

## Project Structure



Starlight looks for `.md` or `.mdx` files in `src/content/docs/`. Each file is exposed as a route based on its file name.

Images go in `src/assets/` and are embedded in Markdown with relative links. Static assets like favicons go in `public/`.

## Commands

All commands run from the project root:

| Command               | Action                                            |
| :-------------------- | :------------------------------------------------ |
| `bun install`         | Install dependencies                              |
| `bun dev`             | Start local dev server at `localhost:4321`        |
| `bun build`           | Build production site to `./dist/`                |
| `bun preview`         | Preview the production build locally              |
| `bun deploy`          | Deploy to Cloudflare Workers via Wrangler         |
| `bun astro ...`       | Run CLI commands like `astro add`, `astro check`  |
| `bun astro -- --help` | Get help using the Astro CLI                      |

## Development

```bash
# Install dependencies
bun install

# Start dev server
bun dev
```

The dev server runs at `http://localhost:4321`. Edit files in `src/content/docs/` and the site hot-reloads.

## Deployment

This site is deployed to Cloudflare Workers. To deploy:

```bash
bun build
bun deploy
```

The `wrangler.jsonc` configures the worker to serve the static `dist/` directory. See [Cloudflare deployment guide](https://docs.opencodehub.space/administration/deploy-cloudflare/) for details.

## Tech Stack

- **Framework:** [Astro](https://astro.build) with [Starlight](https://starlight.astro.build) documentation theme
- **Deployment:** [Cloudflare Workers](https://workers.cloudflare.com) (static assets)
- **Package Manager:** [Bun](https://bun.sh)
