import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import { defineConfig } from "astro/config";
import icon from "astro-icon";

export default defineConfig({
  integrations: [
    react(),
    icon(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  server: {
    port: parseInt(process.env.PORT || "4321"),
    host: true,
  },
  vite: {
    server: {
      watch: {
        ignored: ['**/data/**', '**/repos/**', '**/storage/**', '**/.tmp/**', '**/postgres/**', '**/redis/**'],
      },
    },
    optimizeDeps: {
      exclude: ["nodegit", "better-sqlite3"],
    },
    ssr: {
      noExternal: ["@radix-ui/*"],
    },
  },
});
