import { Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class NewJobPage extends BasePage {
  async goto() {
    await this.navigateTo('/new-job');
  }

  // Form fields
  get appSelect() {
    return this.page.locator('select').first();
  }

  get jobTypeSelect() {
    return this.page.locator('select').nth(1);
  }

  get filenamePrefixInput() {
    return this.page.locator('input[type="text"]').first();
  }

  get descriptionTextarea() {
    return this.page.locator('textarea').first();
  }

  get submitButton() {
    return this.page.getByRole('button', { name: /Create Job/i });
  }

  // Upload folder buttons (conditional)
  get pdfFolderButton() {
    return this.page.getByText(/Click to select folder containing PDF/i);
  }

  get imagesFolderButton() {
    return this.page.getByText(/Click to select folder containing images/i).or(
      this.page.getByText(/Click to select images folder/i)
    );
  }

  // EDR PDF input (P2D only)
  get edrFileInput() {
    return this.page.locator('input[accept=".pdf"]').last();
  }

  // Skip manual configuration checkbox
  get skipManualConfigCheckbox() {
    return this.page.locator('input[type="checkbox"]');
  }

  // Validation errors
  get validationErrors() {
    return this.page.locator('p').filter({ hasText: /.+/ }).locator('[style*="ef4444"]');
  }

  async selectApp(value: string) {
    await this.appSelect.selectOption(value);
  }

  async selectJobType(value: 'physical_to_digital' | 'silhouette_psd' | 'topps_now') {
    await this.jobTypeSelect.selectOption(value);
  }

  async fillFilenamePrefix(prefix: string) {
    await this.filenamePrefixInput.fill(prefix);
  }

  async fillDescription(description: string) {
    await this.descriptionTextarea.fill(description);
  }

  async submit() {
    await this.submitButton.click();
  }

  async expectFieldnamePrefixVisible() {
    await expect(this.page.getByText('Filename Prefix *')).toBeVisible();
  }

  async expectFieldnamePrefixHidden() {
    await expect(this.page.getByText('Filename Prefix *')).not.toBeVisible();
  }

  async expectValidationError(message: string | RegExp) {
    const pattern = typeof message === 'string' ? new RegExp(message, 'i') : message;
    await expect(this.page.locator('p').filter({ hasText: pattern })).toBeVisible();
  }

  async expectFormFields() {
    await expect(this.page.getByText('App *')).toBeVisible();
    await expect(this.page.getByText('Job Type')).toBeVisible();
    await expect(this.page.getByText('Description *')).toBeVisible();
  }

  /**
   * Fill the new job form with provided data and set up files via fileChooser.
   * For folder selection, we intercept the file chooser event.
   */
  async fillForm(options: {
    app: string;
    jobType: 'physical_to_digital' | 'silhouette_psd' | 'topps_now';
    filenamePrefix?: string;
    description: string;
    files?: string[];
    edrFile?: string;
    skipManualConfig?: boolean;
  }) {
    await this.selectApp(options.app);
    await this.selectJobType(options.jobType);

    if (options.filenamePrefix) {
      await this.filenamePrefixInput.waitFor({ state: 'visible', timeout: 5_000 });
      await this.fillFilenamePrefix(options.filenamePrefix);
    }

    await this.fillDescription(options.description);

    // Handle file selection via fileChooser
    if (options.files && options.files.length > 0) {
      const fileChooserPromise = this.page.waitForEvent('filechooser');
      // Click the folder select button
      if (options.jobType === 'physical_to_digital') {
        await this.pdfFolderButton.click();
      } else {
        await this.imagesFolderButton.click();
      }
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(options.files);
    }

    // Handle EDR file selection
    if (options.edrFile) {
      const edrChooserPromise = this.page.waitForEvent('filechooser');
      await this.page.getByText(/Select EDR PDF/i).click();
      const edrChooser = await edrChooserPromise;
      await edrChooser.setFiles(options.edrFile);
    }

    if (options.skipManualConfig) {
      await this.skipManualConfigCheckbox.check();
    }
  }
}
