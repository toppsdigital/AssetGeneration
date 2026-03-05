import { Page, expect } from '@playwright/test';

/**
 * Wait for the job status on the details page to match the expected pattern.
 * Reloads the page periodically to check for status updates.
 */
export async function waitForJobStatus(
  page: Page,
  statusPattern: RegExp,
  options: { pollInterval?: number; timeout?: number } = {}
): Promise<void> {
  const { pollInterval = 15_000, timeout = 600_000 } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const bodyText = await page.textContent('body');
    if (bodyText && statusPattern.test(bodyText)) {
      return;
    }
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  throw new Error(`Page did not show status matching ${statusPattern} within ${timeout}ms`);
}

/**
 * Wait for the upload page to navigate away (indicating upload is complete).
 */
export async function waitForUploadNavigation(
  page: Page,
  timeout = 120_000
): Promise<void> {
  await page.waitForURL(/\/(jobs|job\/details)/, { timeout });
}

/**
 * Wait for network activity on a specific operation to occur (indicating polling/refresh).
 */
export async function waitForPollingRequest(
  page: Page,
  operation: string,
  timeout = 60_000
): Promise<void> {
  await page.waitForResponse(
    (res) => res.url().includes(`operation=${operation}`) && res.status() === 200,
    { timeout }
  );
}
