import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

const STORAGE_STATE = "e2e/.auth/session.json";

// Credentials for the seeded account. Never committed.
config({ path: ".env.test.local" });

// A fixed viewport at deviceScaleFactor 1 keeps the measurement assertions
// meaningful — the design is specified in CSS pixels.
const viewport = { width: 1660, height: 1010 };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3004",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], viewport, deviceScaleFactor: 1 },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport, deviceScaleFactor: 1, storageState: STORAGE_STATE },
    },
  ],
});
