import { expect } from '@playwright/test';
import { BasePage } from './base.page';

export class HomePage extends BasePage {
  async goto() {
    await this.navigateTo('/');
  }

  async expectMainHeadings() {
    await expect(this.page.getByRole('heading', { name: /Physical to Digital Pipeline/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { name: /Create New Digital Assets/i })).toBeVisible();
  }

  get newJobButton() {
    return this.page.getByRole('button', { name: /New Job/i });
  }

  get viewJobsButton() {
    return this.page.getByRole('button', { name: /View Jobs/i });
  }

  get pendingButton() {
    return this.page.getByRole('button', { name: /Pending/i });
  }

  async clickNewJob() {
    await this.newJobButton.click();
  }

  async clickViewJobs() {
    await this.viewJobsButton.click();
  }

  async clickPending() {
    await this.pendingButton.click();
  }
}
