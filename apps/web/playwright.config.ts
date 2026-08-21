import { defineConfig, devices } from "@playwright/test";

const port = 3100;

const breakpointViewports = [
  { name: "base-320", width: 320, height: 720 },
  { name: "base-390", width: 390, height: 844 },
  { name: "sm-600", width: 600, height: 900 },
  { name: "md-768", width: 768, height: 1024 },
  { name: "lg-1024", width: 1024, height: 832 },
  { name: "desktop-1280", width: 1280, height: 832 },
] as const;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 2,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: "en-US",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: breakpointViewports.map(({ name, width, height }) => ({
    name,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width, height },
    },
  })),
  webServer: [
    {
      command: "node tests/e2e/auth-session-server.mjs",
      url: "http://127.0.0.1:8100/api/v1/auth/session/",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `NEXT_DIST_DIR=.next-playwright API_SERVER_BASE_URL=http://127.0.0.1:8100 pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
      url: `http://127.0.0.1:${port}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
