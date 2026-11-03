import { defineConfig } from '@playwright/test';

// Needs the API (with runner images built) and web dev servers: `npm run dev` from the repo root.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1440, height: 900 }, channel: process.env.PW_CHANNEL ?? 'chrome' },
});
