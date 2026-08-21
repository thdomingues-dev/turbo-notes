import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "server-only": new URL("./tests/stubs/server-only.ts", import.meta.url)
        .pathname,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    maxWorkers: 4,
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 10_000,
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/index.ts",
        "src/**/index.client.ts",
        "src/**/index.server.ts",
        "src/shared/api/generated/**",
      ],
      thresholds: {
        "src/shared/api/client.ts": {
          statements: 70,
          branches: 55,
          functions: 90,
          lines: 70,
        },
        "src/features/auth/{api,model,server}/**/*.ts": {
          statements: 70,
          branches: 60,
          functions: 75,
          lines: 80,
        },
        "src/entities/note/api/**/*.ts": {
          statements: 80,
          branches: 55,
          functions: 85,
          lines: 85,
        },
        "src/features/note-autosave/model/**/*.ts": {
          statements: 75,
          branches: 65,
          functions: 85,
          lines: 80,
        },
        "src/app/notes/_model/**/*.ts": {
          statements: 80,
          branches: 60,
          functions: 75,
          lines: 85,
        },
      },
    },
  },
});
