import { defineConfig, devices } from "@playwright/test";

const webPort = 3200;
const apiPort = 8001;
const databaseUrl =
  process.env.FULLSTACK_DATABASE_URL ??
  "postgresql://turbo_ai:turbo_ai@127.0.0.1:5432/turbo_ai";

export default defineConfig({
  testDir: "./tests/fullstack",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "real-postgresql",
      use: { viewport: { width: 1024, height: 832 } },
    },
  ],
  webServer: [
    {
      command:
        "uv run python manage.py migrate && exec uv run python manage.py runserver 127.0.0.1:8001 --noreload",
      cwd: "../api",
      env: {
        DATABASE_URL: databaseUrl,
        DJANGO_ALLOWED_HOSTS: "localhost,127.0.0.1",
        DJANGO_CSRF_TRUSTED_ORIGINS: "http://127.0.0.1:3200",
        DJANGO_SECRET_KEY: "fullstack-test-only",
        DJANGO_SETTINGS_MODULE: "config.settings.local",
      },
      url: `http://127.0.0.1:${apiPort}/health/ready/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        "NEXT_DIST_DIR=.next-fullstack API_INTERNAL_BASE_URL=http://127.0.0.1:8001 pnpm exec next dev --hostname 127.0.0.1 --port 3200",
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
