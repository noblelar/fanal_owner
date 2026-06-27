import { defineConfig } from '@playwright/test'

const useMicrosoftEdge = process.platform === 'win32' && !process.env.PLAYWRIGHT_CHANNEL

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 7_500,
  },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || (useMicrosoftEdge ? 'msedge' : undefined),
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node ./e2e/mock-platform-api.mjs',
      url: 'http://127.0.0.1:4174/__test/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'node ./scripts/dev-e2e.mjs',
      url: 'http://127.0.0.1:4173/login',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
