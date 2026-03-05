import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class UploadingPage extends BasePage {
  async goto(jobId: string) {
    await this.navigateTo(`/job/uploading?jobId=${jobId}`);
  }

  get statusText() {
    return this.page.locator('text=/uploading|validating|completed|error/i').first();
  }

  get fileList() {
    return this.page.locator('[style*="display: flex"]').filter({ hasText: /\.(pdf|tif|tiff|png|jpg|jpeg)/i });
  }

  get doneButton() {
    return this.page.getByRole('button', { name: /Done|View Job/i });
  }

  get retryButton() {
    return this.page.getByRole('button', { name: /Retry/i });
  }

  get errorMessage() {
    return this.page.locator('text=/error|failed/i').first();
  }

  async waitForUploadComplete(timeout = 120_000) {
    // Wait for the upload step to reach 'completed' or navigation away
    await this.page.waitForFunction(
      () => {
        const url = window.location.href;
        // Either navigated away from uploading page or shows completed
        return !url.includes('/uploading') || document.body.textContent?.includes('completed');
      },
      { timeout }
    );
  }

  async waitForNavigation(timeout = 120_000) {
    await this.page.waitForURL(/\/(jobs|job\/details)/, { timeout });
  }

  async expectUploadInProgress() {
    // Should see file names being uploaded
    await expect(this.page.getByText(/uploading|processing|pending/i).first()).toBeVisible({ timeout: 10_000 });
  }
}
