import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [react(), tailwind({ applyBaseStyles: false })],
  output: "server",
  adapter: node({ mode: "standalone" }),
  server: { port: 4322, host: true },
  vite: {
    ssr: { noExternal: ["@radix-ui/*"] },
  },
});
