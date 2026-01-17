import vercel from "@astrojs/vercel/serverless";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  output: "server",
  adapter: vercel({
    webAnalytics: {
      enabled: true,
    },
  }),
  server: {
    port: 3000,
    host: true,
  },
  vite: {
    optimizeDeps: {
      exclude: ["nodegit", "better-sqlite3"],
    },
    ssr: {
      noExternal: ["@radix-ui/*"],
    },
  },
});
