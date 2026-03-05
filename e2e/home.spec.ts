import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test('should display the main page sections', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /Physical to Digital Pipeline/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Create New Digital Assets/i })).toBeVisible();
  });

  test('should have navigation buttons', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: /New Job/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /View Jobs/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Pending/i })).toBeVisible();
  });

  test('New Job button navigates to /new-job', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /New Job/i }).click();
    await expect(page).toHaveURL(/\/new-job/);
  });

  test('View Jobs button navigates to /jobs', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /View Jobs/i }).click();
    await expect(page).toHaveURL(/\/jobs/);
  });

  test('Pending button navigates to /pending-jobs', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /Pending/i }).click();
    await expect(page).toHaveURL(/\/pending-jobs/);
  });

  test('should show loading state for templates', async ({ page }) => {
    await page.goto('/');

    // Either loading spinner or template content should be present
    const hasSpinner = await page.getByText(/Fetching available PSDs/i).isVisible().catch(() => false);
    const hasTemplates = await page.locator('ul').isVisible().catch(() => false);
    const hasNoTemplates = await page.getByText(/No PSD template files found/i).isVisible().catch(() => false);

    expect(hasSpinner || hasTemplates || hasNoTemplates).toBeTruthy();
  });
});
