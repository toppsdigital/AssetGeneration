import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class JobDetailsPage extends BasePage {
  async goto(jobId: string) {
    await this.navigateTo(`/job/details?jobId=${jobId}`);
  }

  // Job header
  get jobStatus() {
    return this.page.locator('text=/uploading|uploaded|extracting|extracted|generating|generated|completed|failed/i').first();
  }

  get refreshButton() {
    return this.page.getByRole('button', { name: /Refresh/i });
  }

  // File section
  get fileCards() {
    return this.page.locator('[style*="cursor"]').filter({ hasText: /\.(pdf|tif|tiff|png|jpg|jpeg)/i });
  }

  // Asset operations
  get generateButton() {
    return this.page.getByRole('button', { name: /Generate/i });
  }

  get downloadAllButton() {
    return this.page.getByRole('button', { name: /Download All/i });
  }

  get downloadExtractedButton() {
    return this.page.getByRole('button', { name: /Download Extracted/i }).or(
      this.page.getByText(/Download Extracted/i)
    );
  }

  get downloadGeneratedButton() {
    return this.page.getByRole('button', { name: /Download Generated/i }).or(
      this.page.getByText(/Download Generated|Download Digital/i)
    );
  }

  // Preview links
  get previewExtractedLink() {
    return this.page.getByText(/Preview Extracted|View Extracted/i).first();
  }

  get previewDigitalLink() {
    return this.page.getByText(/Preview Digital|View Digital/i).first();
  }

  get previewOriginalLink() {
    return this.page.getByText(/Preview Original|View Original/i).first();
  }

  // Asset management
  get createAssetButton() {
    return this.page.getByRole('button', { name: /Create|Add Asset/i }).first();
  }

  get importFromEdrButton() {
    return this.page.getByRole('button', { name: /Import from EDR/i });
  }

  // Advanced options
  get chromeToggle() {
    return this.page.getByText(/Chrome/i).locator('..').locator('input[type="checkbox"], [role="switch"]').first();
  }

  get foilToggle() {
    return this.page.getByText(/Foil/i).locator('..').locator('input[type="checkbox"], [role="switch"]').first();
  }

  // Assets table
  get assetsTable() {
    return this.page.locator('table').first();
  }

  get assetRows() {
    return this.page.locator('table tbody tr, [data-asset-id]');
  }

  async clickRefresh() {
    await this.refreshButton.click();
  }

  async clickGenerate() {
    await this.generateButton.click();
  }

  async waitForJobData(timeout = 30_000) {
    await this.waitForApiResponse('get_job', timeout);
  }

  async expectJobLoaded() {
    // Wait for job data to appear (either files or status)
    await expect(
      this.jobStatus.or(this.page.getByText(/No files/i))
    ).toBeVisible({ timeout: 15_000 });
  }

  async expectStatus(statusPattern: RegExp) {
    await expect(this.jobStatus.filter({ hasText: statusPattern })).toBeVisible({ timeout: 10_000 });
  }

  async getJobStatusText(): Promise<string> {
    return (await this.jobStatus.textContent()) || '';
  }

  async clickPreviewExtracted() {
    await this.previewExtractedLink.click();
  }

  async clickPreviewDigital() {
    await this.previewDigitalLink.click();
  }

  async clickPreviewOriginal() {
    await this.previewOriginalLink.click();
  }
}
