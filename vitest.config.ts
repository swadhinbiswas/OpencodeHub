import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    include: ["src/**/*.test.ts", "tests/**/*.test.ts", "cli/src/**/*.test.ts"],
    exclude: ["tests/e2e/**", "cli/dist/**", "node_modules/**"],
    coverage: {
      reporter: ["text", "json-summary", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/db/**",
        "src/pages/**",
        "src/runner/**",
        "src/middleware/**",
        "src/layouts/**",
      ],
    },
  },
});
