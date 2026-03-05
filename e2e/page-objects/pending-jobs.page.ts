import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class PendingJobsPage extends BasePage {
  async goto() {
    await this.navigateTo('/pending-jobs');
  }

  // View toggle
  get pendingToggle() {
    return this.page.getByRole('button', { name: /^Pending$/i });
  }

  get processedToggle() {
    return this.page.getByRole('button', { name: /^Processed$/i });
  }

  get refreshButton() {
    return this.page.getByRole('button', { name: /Refresh/i });
  }

  // Breadcrumb
  get breadcrumb() {
    return this.page.getByText(/Pending Projects|Processed Projects/i);
  }

  get breadcrumbBackLink() {
    return this.page.getByText(/Pending Projects|Processed Projects/i).first();
  }

  // Search
  get searchInput() {
    return this.page.getByLabel('Search');
  }

  get clearSearchButton() {
    return this.page.getByLabel('Clear search');
  }

  get itemCount() {
    return this.page.getByText(/\d+ \/ \d+/);
  }

  // Project/subset cards
  get projectCards() {
    return this.page.locator('[style*="cursor: pointer"]').filter({ has: this.page.locator('div') });
  }

  get subsetCards() {
    return this.page.locator('[style*="border-radius: 12px"]').filter({ has: this.page.getByRole('button') });
  }

  // Subset action buttons
  getProcessJobButton(subsetName?: string) {
    if (subsetName) {
      return this.page.locator('div').filter({ hasText: subsetName }).getByRole('button', { name: /Process Job/i });
    }
    return this.page.getByRole('button', { name: /Process Job/i }).first();
  }

  getMarkProcessedButton(subsetName?: string) {
    if (subsetName) {
      return this.page.locator('div').filter({ hasText: subsetName }).getByText(/Mark Processed/i);
    }
    return this.page.getByText(/Mark Processed/i).first();
  }

  getMoveBackButton(subsetName?: string) {
    if (subsetName) {
      return this.page.locator('div').filter({ hasText: subsetName }).getByRole('button', { name: /Move back to Pending/i });
    }
    return this.page.getByRole('button', { name: /Move back to Pending/i }).first();
  }

  // Loading/empty states
  get loadingSpinner() {
    return this.page.getByText(/Loading/i);
  }

  get noItemsMessage() {
    return this.page.getByText(/No pending|No processed|Nothing here/i);
  }

  get noMatchesMessage() {
    return this.page.getByText(/No matches/i);
  }

  get errorMessage() {
    return this.page.getByText(/Error/i).first();
  }

  async switchToProcessed() {
    await this.processedToggle.click();
  }

  async switchToPending() {
    await this.pendingToggle.click();
  }

  async clickProject(projectName: string) {
    await this.page.locator('div').filter({ hasText: new RegExp(`^${projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first().click();
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async clearSearch() {
    await this.clearSearchButton.click();
  }

  async waitForProjectsLoad() {
    // Wait for loading to finish
    await this.page.waitForFunction(
      () => !document.body.textContent?.includes('Loading'),
      { timeout: 15_000 }
    );
  }

  async expectProjectsVisible() {
    await expect(
      this.projectCards.first().or(this.noItemsMessage)
    ).toBeVisible({ timeout: 15_000 });
  }
}
