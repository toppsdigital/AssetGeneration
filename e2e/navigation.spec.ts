import { test, expect } from '@playwright/test';

test.describe('Page Navigation', () => {
  test('jobs page loads', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page).toHaveURL(/\/jobs/);
  });

  test('new-job page loads', async ({ page }) => {
    await page.goto('/new-job');
    await expect(page).toHaveURL(/\/new-job/);
  });

  test('pending-jobs page loads', async ({ page }) => {
    await page.goto('/pending-jobs');
    await expect(page).toHaveURL(/\/pending-jobs/);
  });

  test('page title is set', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Asset Generation/i);
  });
});
