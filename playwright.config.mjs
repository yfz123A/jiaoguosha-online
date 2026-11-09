import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 180000,
  workers: 1,
  use: { channel: "chrome", headless: true },
  reporter: "list",
});
