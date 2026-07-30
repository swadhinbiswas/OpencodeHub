import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import icon from "astro-icon";

// Load environment variables safely
const port = parseInt(process.env.PORT || "4321");

export default defineConfig({
  integrations: [
    react(),
    icon(),
  ],
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  server: {
    port,
    host: true,
  },
  vite: {
    css: {
      transformer: 'postcss',
    },
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
