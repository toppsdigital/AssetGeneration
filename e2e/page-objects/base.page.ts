import { Page, expect } from '@playwright/test';

export class BasePage {
  constructor(protected page: Page) {}

  async navigateTo(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
  }

  async waitForApiResponse(operation: string, timeout = 30_000) {
    return this.page.waitForResponse(
      (res) => res.url().includes(`operation=${operation}`) && res.status() === 200,
      { timeout }
    );
  }

  async waitForAnyApiResponse(timeout = 10_000) {
    return this.page.waitForResponse(
      (res) => res.url().includes('content-pipeline-proxy') && res.status() === 200,
      { timeout }
    );
  }

  async getPageTitle() {
    return this.page.title();
  }

  async clickNavButton(name: string) {
    await this.page.getByRole('button', { name: new RegExp(name, 'i') }).click();
  }

  async expectUrl(pattern: RegExp) {
    await expect(this.page).toHaveURL(pattern);
  }
}
