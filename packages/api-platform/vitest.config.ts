import { defineConfig } from "vite-plus";

// oxlint-disable-next-line no-restricted-properties -- Test runner configuration reads CI before application environment validation.
const isCI = process.env.CI === "true" || process.env.CI === "1";

export default defineConfig({
  test: {
    env: {
      AUTH_SECRET: "test-auth-secret-test-auth-secret",
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      EMAIL_FROM: "test@example.com",
      EMAIL_PROVIDER: "smtp",
      EMAIL_SMTP_URL: "smtp://localhost:1025",
      KV_PROVIDER: "",
      NODE_ENV: "test",
    },
    environment: "node",
    // Keep database-heavy workers serial only on smaller CI runners.
    maxWorkers: isCI ? 1 : 4,
    pool: "forks",
  },
});
