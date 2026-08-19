// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://docs.opencodehub.space",
  integrations: [
    starlight({
      title: "OpenCodeHub Docs",
      logo: {
        light: "./src/assets/logo-light.png",
        dark: "./src/assets/logo-dark.png",
        replacesTitle: false,
      },
      customCss: ["./src/custom.css"],
      components: {
        Hero: "./src/components/StarlightHero.astro",
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
            { label: "CircleCI Integration", slug: "guides/circleci-integration" },
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
            { label: "CI/CD Actions", slug: "features/ci-actions" },
            { label: "CI/CD Pipelines", slug: "features/ci-cd" },
            { label: "Automation Rules", slug: "features/automations" },
            { label: "PR Inbox", slug: "features/inbox" },
            { label: "Developer Metrics", slug: "features/developer-metrics" },
            { label: "Notifications", slug: "features/notifications" },
            { label: "Slack Integration", slug: "features/slack-integration" },
            { label: "Federation & Cross-Instance PRs", slug: "features/federation" },
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
            { label: "Coolify", slug: "administration/deploy-coolify" },
            { label: "NAS (Synology/TrueNAS)", slug: "administration/deploy-nas" },
            { label: "Kubernetes (Helm)", slug: "administration/kubernetes" },
          ],
        },
        {
          label: "Administration",
          items: [
            { label: "Production Guide", slug: "administration/deployment" },
            { label: "Configuration", slug: "administration/configuration" },
            { label: "Monitoring", slug: "administration/monitoring" },
            { label: "Security", slug: "administration/security" },
            { label: "Deployment Matrix", slug: "administration/deployment-matrix" },
            { label: "Secret Rotation", slug: "administration/secret-rotation" },
            { label: "Expose NAS / Home Server", slug: "administration/expose-nas" },
            { label: "CircleCI Cloud Workers", slug: "administration/circleci-cloud" },
            { label: "CircleCI Self-Hosted", slug: "administration/circleci-worker" },
          ],
        },
        {
          label: "Operations",
          items: [
            { label: "Incident Runbook", slug: "administration/incident-runbook" },
            { label: "Postmortem Template", slug: "administration/postmortem-template" },
            { label: "Operations Drills", slug: "administration/operations-drills" },
          ],
        },
        {
          label: "API Reference",
          autogenerate: { directory: "api" },
        },
        {
          label: "Development",
          items: [
            { label: "Architecture", slug: "development/architecture" },
            { label: "Local Dev Setup", slug: "development/local-dev-setup" },
            { label: "Contributing", slug: "development/contributing" },
            { label: "Database Schema", slug: "development/database-schema" },
            { label: "Database Migrations", slug: "development/database-migrations" },
            { label: "Testing", slug: "development/testing" },
            { label: "Testing & CI", slug: "development/testing-pipelines" },
            { label: "Security Hardening", slug: "development/security-hardening" },
            { label: "Observability", slug: "development/observability" },
            { label: "Publishing CLI", slug: "development/publishing-cli" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Glossary", slug: "reference/glossary" },
          ],
        },
      ],
    }),
  ],
});
