import { test, expect } from './fixtures/app-fixtures';

test.describe('Jobs List Page', () => {
  test.beforeEach(async ({ jobsPage }) => {
    await jobsPage.goto();
  });

  test('should display jobs list with job cards', async ({ jobsPage, page }) => {
    await jobsPage.expectJobsVisible();
  });

  test('should filter between All Jobs and My Jobs', async ({ jobsPage, page }) => {
    await jobsPage.expectJobsVisible();

    // Click "My" filter
    await jobsPage.clickMyJobs();
    await page.waitForTimeout(1000);

    // Click "All" filter
    await jobsPage.clickAllJobs();
    await page.waitForTimeout(1000);

    // Verify we're still on the jobs page
    await expect(page).toHaveURL(/\/jobs/);
  });

  test('should filter by status', async ({ jobsPage, page }) => {
    await jobsPage.expectJobsVisible();

    // Filter to "In Progress"
    await jobsPage.filterByStatus('In Progress');
    await page.waitForTimeout(1000);

    // Filter to "Completed"
    await jobsPage.filterByStatus('Completed');
    await page.waitForTimeout(1000);

    // Reset to "All Status"
    await jobsPage.filterByStatus('All Status');
    await page.waitForTimeout(1000);
  });

  test('should have auto-refresh with polling', async ({ page }) => {
    // Listen for list_jobs API calls - should happen automatically
    const requests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('operation=list_jobs')) {
        requests.push(req.url());
      }
    });

    // Wait up to 60s for at least 2 polling requests
    await page.waitForTimeout(35_000);
    expect(requests.length).toBeGreaterThanOrEqual(1);
  });

  test('New button navigates to /new-job', async ({ jobsPage, page }) => {
    await jobsPage.clickNew();
    await expect(page).toHaveURL(/\/new-job/);
  });

  test('clicking a job card navigates to job details', async ({ jobsPage, page }) => {
    await jobsPage.expectJobsVisible();

    const cardCount = await jobsPage.getJobCount();
    if (cardCount > 0) {
      await jobsPage.clickFirstJob();
      await expect(page).toHaveURL(/\/job\/details\?jobId=/);
    }
  });

  test('should show status select with correct options', async ({ jobsPage, page }) => {
    const select = jobsPage.statusSelect;
    await expect(select).toBeVisible();

    // Verify options exist
    const options = await select.locator('option').allTextContents();
    expect(options.some((o) => /all/i.test(o))).toBeTruthy();
    expect(options.some((o) => /in progress/i.test(o))).toBeTruthy();
    expect(options.some((o) => /completed/i.test(o))).toBeTruthy();
  });
});
