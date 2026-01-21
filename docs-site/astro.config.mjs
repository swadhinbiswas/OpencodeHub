// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
    integrations: [
        starlight({
            title: 'OpenCodeHub Docs',
            social: [
                { icon: 'github', label: 'GitHub', href: 'https://github.com/swadhinbiswas/OpencodeHub' },
            ],
            sidebar: [
                {
                    label: 'Getting Started',
                    items: [
                        { label: 'Installation', slug: 'getting-started/installation' },
                        { label: 'Quick Start', slug: 'getting-started/quick-start' },
                        { label: 'First Repository', slug: 'getting-started/first-repository' },
                    ],
                },
                {
                    label: 'Guides',
                    items: [
                        { label: 'Team Workflows', slug: 'guides/team-workflows' },
                        { label: 'Branch Protection', slug: 'guides/branch-protection' },
                        { label: 'Webhooks', slug: 'guides/webhooks' },
                        { label: 'Storage Adapters', slug: 'guides/storage-adapters' },
                    ],
                },
                {
                    label: 'Features',
                    items: [
                        { label: 'Stacked PRs', slug: 'features/stacked-prs' },
                        { label: 'AI Review', slug: 'features/ai-review' },
                        { label: 'Merge Queue', slug: 'features/merge-queue' },
                    ],
                },
                {
                    label: 'Tutorials',
                    autogenerate: { directory: 'tutorials' },
                },
                {
                    label: 'Administration',
                    autogenerate: { directory: 'administration' },
                },
                {
                    label: 'API Reference',
                    autogenerate: { directory: 'api' },
                },
                {
                    label: 'Development',
                    autogenerate: { directory: 'development' },
                },
                {
                    label: 'Reference',
                    autogenerate: { directory: 'reference' },
                },
            ],
        }),
    ],
});
