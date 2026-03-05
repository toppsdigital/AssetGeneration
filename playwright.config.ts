import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  globalTeardown: './e2e/global.teardown.ts',
  use: {
    baseURL: 'http://localhost:5000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'smoke',
      testMatch: [
        'home.spec.ts',
        'navigation.spec.ts',
        'new-job-form.spec.ts',
        'non-functional.spec.ts',
      ],
      timeout: 60_000,
    },
    {
      name: 'jobs-list',
      testMatch: ['jobs-list.spec.ts', 'pending-jobs.spec.ts'],
      timeout: 120_000,
    },
    {
      name: 'workflows',
      testMatch: [
        'physical-to-digital.spec.ts',
        'topps-now.spec.ts',
        'silhouette-psd.spec.ts',
      ],
      timeout: 900_000, // 15 min per test for long generation waits
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      E2E_TESTING: 'true',
    },
  },
});
