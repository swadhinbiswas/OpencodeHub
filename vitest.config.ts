import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    include: ["src/**/*.test.ts", "tests/**/*.test.ts", "cli/src/**/*.test.ts"],
    exclude: ["tests/e2e/**", "cli/dist/**", "node_modules/**"],
  },
});
