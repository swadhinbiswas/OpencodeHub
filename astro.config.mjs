import node from "@astrojs/node";
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
  adapter: node({
    mode: "standalone",
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
