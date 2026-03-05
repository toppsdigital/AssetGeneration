import { test, expect } from './fixtures/app-fixtures';

test.describe('Non-Functional Tests', () => {
  test('responsive: pages render without horizontal overflow at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5); // Small tolerance
  });

  test('responsive: pages render without horizontal overflow at 768px', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    for (const path of ['/', '/jobs', '/new-job', '/pending-jobs']) {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
    }
  });

  test('responsive: pages render without horizontal overflow at 375px (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    for (const path of ['/', '/jobs', '/new-job', '/pending-jobs']) {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
    }
  });

  test('no broken navigation links', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Click each nav button and verify no 404
    const navTargets = [
      { button: /New Job/i, expectedUrl: /\/new-job/ },
      { button: /View Jobs/i, expectedUrl: /\/jobs/ },
      { button: /Pending/i, expectedUrl: /\/pending-jobs/ },
    ];

    for (const { button, expectedUrl } of navTargets) {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      await page.getByRole('button', { name: button }).click();
      await expect(page).toHaveURL(expectedUrl);

      // Verify the page didn't show a 404 or error
      const has404 = await page.getByText(/404|not found/i).isVisible().catch(() => false);
      expect(has404).toBeFalsy();
    }
  });

  test('error messages for invalid job ID', async ({ page }) => {
    // Navigate to job details with a non-existent job ID
    await page.goto('/job/details?jobId=nonexistent-job-id-12345');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);

    // Should show some error or empty state (not crash)
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    // Should NOT be a blank/crashed page
    expect(bodyText!.length).toBeGreaterThan(10);
  });

  test('auto-refresh indicator on jobs page', async ({ page }) => {
    await page.goto('/jobs');
    await page.waitForLoadState('domcontentloaded');

    // Monitor for periodic API calls (auto-refresh)
    let apiCallCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('operation=list_jobs')) {
        apiCallCount++;
      }
    });

    // Wait for at least one auto-refresh cycle
    await page.waitForTimeout(35_000);
    expect(apiCallCount).toBeGreaterThanOrEqual(1);
  });
});
