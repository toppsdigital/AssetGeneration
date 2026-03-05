import { Page, expect, Locator } from '@playwright/test';
import { BasePage } from './base.page';

export class JobsPage extends BasePage {
  async goto() {
    await this.navigateTo('/jobs');
  }

  // Filter buttons
  get allJobsButton() {
    return this.page.getByRole('button', { name: /^All$/i });
  }

  get myJobsButton() {
    return this.page.getByRole('button', { name: /^My$/i });
  }

  get statusSelect() {
    return this.page.locator('select').first();
  }

  get newButton() {
    return this.page.getByRole('button', { name: /New/i }).first();
  }

  // Job cards - clickable rows with job info
  get jobCards() {
    return this.page.locator('[style*="cursor: pointer"]').filter({ has: this.page.locator('div') });
  }

  get jobCountText() {
    return this.page.getByText(/\d+ Jobs?/);
  }

  async filterByStatus(status: 'All Status' | 'In Progress' | 'Completed') {
    const valueMap: Record<string, string> = {
      'All Status': 'all',
      'In Progress': 'in-progress',
      'Completed': 'completed',
    };
    await this.statusSelect.selectOption(valueMap[status]);
  }

  async clickAllJobs() {
    await this.allJobsButton.click();
  }

  async clickMyJobs() {
    await this.myJobsButton.click();
  }

  async clickNew() {
    await this.newButton.click();
  }

  async clickFirstJob() {
    await this.jobCards.first().click();
  }

  async getJobCount(): Promise<number> {
    const cards = await this.jobCards.count();
    return cards;
  }

  async waitForJobsLoad() {
    // Wait for the jobs API response
    await this.waitForApiResponse('list_jobs', 30_000);
  }

  async expectJobsVisible() {
    // Either job cards or a "no jobs" message should appear
    await expect(
      this.page.locator('[style*="cursor: pointer"]').first().or(this.page.getByText(/no jobs/i).first())
    ).toBeVisible({ timeout: 15_000 });
  }

  // Delete modal
  get deleteConfirmButton() {
    return this.page.getByRole('button', { name: /Confirm|Delete|Yes/i });
  }

  get deleteCancelButton() {
    return this.page.getByRole('button', { name: /Cancel|No/i });
  }
}
