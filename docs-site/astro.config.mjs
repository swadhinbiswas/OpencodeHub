// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "OpenCodeHub Docs",
      logo: {
        light: "../../public/logo-light.png",
        dark: "../../public/logo-dark.png",
        replacesTitle: false,
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/swadhinbiswas/OpencodeHub",
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Installation", slug: "getting-started/installation" },
            { label: "Quick Start", slug: "getting-started/quick-start" },
            {
              label: "First Repository",
              slug: "getting-started/first-repository",
            },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Team Workflows", slug: "guides/team-workflows" },
            { label: "Branch Protection", slug: "guides/branch-protection" },
            { label: "Webhooks", slug: "guides/webhooks" },
            { label: "Storage Adapters", slug: "guides/storage-adapters" },
          ],
        },
        {
          label: "CLI",
          items: [
            { label: "CLI Overview", slug: "reference/cli-overview" },
            { label: "Auth & Config", slug: "reference/cli-auth-config" },
            { label: "Core Commands", slug: "reference/cli-core-commands" },
            { label: "Stack Workflows", slug: "reference/cli-stack-workflows" },
            { label: "Merge Queue", slug: "reference/cli-merge-queue" },
            {
              label: "Automation & Insights",
              slug: "reference/cli-automation-insights",
            },
            { label: "CLI Command Reference", slug: "reference/cli-commands" },
          ],
        },
        {
          label: "Features",
          items: [
            { label: "Stacked PRs", slug: "features/stacked-prs" },
            { label: "AI Review", slug: "features/ai-review" },
            { label: "Merge Queue", slug: "features/merge-queue" },
            { label: "Automation Rules", slug: "features/automations" },
            { label: "PR Inbox", slug: "features/inbox" },
            { label: "Developer Metrics", slug: "features/developer-metrics" },
            { label: "Notifications", slug: "features/notifications" },
            { label: "CI/CD Actions", slug: "features/ci-actions" },
            { label: "CLI Workflows", slug: "features/cli" },
          ],
        },
        {
          label: "Tutorials",
          autogenerate: { directory: "tutorials" },
        },
        {
          label: "Deployment",
          items: [
            { label: "Docker", slug: "administration/deploy-docker" },
            { label: "Podman", slug: "administration/deploy-podman" },
            { label: "Nginx Proxy", slug: "administration/deploy-nginx" },
            { label: "cPanel", slug: "administration/deploy-cpanel" },
            { label: "CyberPanel", slug: "administration/deploy-cyberpanel" },
            { label: "Cloudflare", slug: "administration/deploy-cloudflare" },
          ],
        },
        {
          label: "Administration",
          items: [
            { label: "Production Guide", slug: "administration/deployment" },
            { label: "Configuration", slug: "administration/configuration" },
            { label: "Monitoring", slug: "administration/monitoring" },
            { label: "Security", slug: "administration/security" },
          ],
        },
        {
          label: "API Reference",
          autogenerate: { directory: "api" },
        },
        {
          label: "Development",
          autogenerate: { directory: "development" },
        },
        {
          label: "Reference",
          autogenerate: { directory: "reference" },
        },
      ],
    }),
  ],
});
