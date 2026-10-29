import { defineConfig } from "@playwright/test";

/**
 * Smoke test for the Agent Caller public pages.
 *
 * Local:        npm run start (or set BASE_URL=http://localhost:3177) then: npm run smoke
 * Live deploy:  BASE_URL=https://agent-caller-rho.vercel.app npm run smoke
 *
 * Uses the locally installed Chrome via channel="chrome" so no browser
 * download is required (`npx playwright install` is not needed).
 *
 * The webServer below only starts when BASE_URL is not set, so pointing the
 * tests at any deployed URL works without touching the local dev server.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3177",
    launchOptions: { channel: "chrome" },
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npx next start -p 3177",
        url: "http://localhost:3177",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
