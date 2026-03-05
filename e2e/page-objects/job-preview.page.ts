import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class JobPreviewPage extends BasePage {
  async goto(jobId: string, fileId: string, mode: 'extracted-assets' | 'digital-assets' | 'original-files') {
    await this.navigateTo(`/job/preview?jobId=${jobId}&fileId=${encodeURIComponent(fileId)}&mode=${mode}`);
  }

  get imageGrid() {
    return this.page.locator('[style*="display: grid"]').first();
  }

  get imageCards() {
    return this.page.locator('img').filter({ has: this.page.locator('[alt]') });
  }

  get allImages() {
    return this.page.locator('img');
  }

  get noAssetsMessage() {
    return this.page.getByText(/No assets found|No files found/i);
  }

  get assetCountText() {
    return this.page.getByText(/\d+ (assets?|files?|items?)/i);
  }

  // Modal
  get expandedModal() {
    return this.page.locator('[style*="position: fixed"]').filter({ has: this.page.locator('img') });
  }

  get modalPreviousButton() {
    return this.expandedModal.getByRole('button').first();
  }

  get modalNextButton() {
    return this.expandedModal.getByRole('button').last();
  }

  get modalCloseButton() {
    return this.expandedModal.locator('button, [role="button"]').filter({ hasText: /close|×|✕/i });
  }

  async clickImage(index: number) {
    await this.allImages.nth(index).click();
  }

  async expectImagesVisible(minCount = 1) {
    await expect(this.allImages.first()).toBeVisible({ timeout: 15_000 });
    const count = await this.allImages.count();
    expect(count).toBeGreaterThanOrEqual(minCount);
  }

  async expectModalOpen() {
    await expect(this.expandedModal).toBeVisible();
  }

  async expectModalClosed() {
    await expect(this.expandedModal).not.toBeVisible();
  }
}
