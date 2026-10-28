import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';

const testDbPath = path.join(os.tmpdir(), `kaj-e2e-${Date.now()}.db`);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4822',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node dist/server/index.js',
    url: 'http://127.0.0.1:4822/api/health',
    reuseExistingServer: false,
    timeout: 15000,
    env: {
      PORT: '4822',
      HOST: '127.0.0.1',
      KAJ_DB_PATH: testDbPath,
    },
  },
});
