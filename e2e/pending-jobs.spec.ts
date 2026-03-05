import { test, expect } from './fixtures/app-fixtures';

test.describe('Pending Jobs Page', () => {
  test.beforeEach(async ({ pendingJobsPage }) => {
    await pendingJobsPage.goto();
    await pendingJobsPage.waitForProjectsLoad();
  });

  test('should display pending projects list', async ({ pendingJobsPage }) => {
    await pendingJobsPage.expectProjectsVisible();
    // Breadcrumb should show "Pending Projects"
    await expect(pendingJobsPage.breadcrumb).toBeVisible();
  });

  test('should drill into a project to see subsets', async ({ pendingJobsPage, page }) => {
    // Only run if there are projects
    const hasProjects = await pendingJobsPage.projectCards.first().isVisible().catch(() => false);
    if (!hasProjects) {
      test.skip(true, 'No pending projects available');
      return;
    }

    // Click the first project
    await pendingJobsPage.projectCards.first().click();

    // Should now see subsets (or empty message)
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Loading subsets'),
      { timeout: 15_000 }
    );

    // Breadcrumb should show project name with ">" separator
    await expect(page.getByText('>')).toBeVisible();
  });

  test('Process Job navigates to new-job', async ({ pendingJobsPage, page }) => {
    const hasProjects = await pendingJobsPage.projectCards.first().isVisible().catch(() => false);
    if (!hasProjects) {
      test.skip(true, 'No pending projects available');
      return;
    }

    // Drill into first project
    await pendingJobsPage.projectCards.first().click();
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Loading subsets'),
      { timeout: 15_000 }
    );

    // Check for Process Job button
    const hasProcessButton = await pendingJobsPage.getProcessJobButton().isVisible().catch(() => false);
    if (!hasProcessButton) {
      test.skip(true, 'No subsets with Process Job button');
      return;
    }

    await pendingJobsPage.getProcessJobButton().click();

    // Should navigate to new-job with pendingSubset param
    await expect(page).toHaveURL(/\/new-job\?pendingSubset=/, { timeout: 15_000 });
  });

  test('Mark Processed moves subset', async ({ pendingJobsPage, page }) => {
    const hasProjects = await pendingJobsPage.projectCards.first().isVisible().catch(() => false);
    if (!hasProjects) {
      test.skip(true, 'No pending projects available');
      return;
    }

    await pendingJobsPage.projectCards.first().click();
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Loading subsets'),
      { timeout: 15_000 }
    );

    const hasMarkButton = await pendingJobsPage.getMarkProcessedButton().isVisible().catch(() => false);
    if (!hasMarkButton) {
      test.skip(true, 'No subsets with Mark Processed button');
      return;
    }

    // Get count before
    const countBefore = await pendingJobsPage.subsetCards.count();

    await pendingJobsPage.getMarkProcessedButton().click();
    await page.waitForTimeout(3000);

    // Count should decrease or stay same (if more loaded)
    const countAfter = await pendingJobsPage.subsetCards.count();
    expect(countAfter).toBeLessThanOrEqual(countBefore);
  });

  test('should toggle to Processed tab and back', async ({ pendingJobsPage, page }) => {
    // Switch to processed view
    await pendingJobsPage.switchToProcessed();
    await pendingJobsPage.waitForProjectsLoad();

    // Breadcrumb should show "Processed Projects"
    await expect(page.getByText(/Processed Projects/i)).toBeVisible();

    // Switch back to pending
    await pendingJobsPage.switchToPending();
    await pendingJobsPage.waitForProjectsLoad();

    await expect(page.getByText(/Pending Projects/i)).toBeVisible();
  });

  test('should search and filter projects', async ({ pendingJobsPage, page }) => {
    const hasProjects = await pendingJobsPage.projectCards.first().isVisible().catch(() => false);
    if (!hasProjects) {
      test.skip(true, 'No pending projects available');
      return;
    }

    // Type a search query
    await pendingJobsPage.search('zzz_nonexistent_query_zzz');
    await page.waitForTimeout(500);

    // Should show "No matches"
    await expect(pendingJobsPage.noMatchesMessage).toBeVisible();

    // Clear search
    await pendingJobsPage.clearSearch();
    await page.waitForTimeout(500);

    // Projects should reappear
    await pendingJobsPage.expectProjectsVisible();
  });
});
