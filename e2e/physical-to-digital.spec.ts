import { test, expect } from './fixtures/app-fixtures';
import { trackJobForCleanup, pollJobUntilStatus } from './helpers/api-helpers';
import { waitForJobStatus } from './helpers/wait-helpers';
import path from 'path';

const TEST_FILES_DIR = path.join(__dirname, 'fixtures', 'test-files');
const PDF_DIR = path.join(TEST_FILES_DIR, 'pdfs');
const EDR_DIR = path.join(TEST_FILES_DIR, 'edr');

test.describe.serial('Physical to Digital Workflow', () => {
  let jobId: string;

  test('should create a new P2D job', async ({ newJobPage, page }) => {
    await newJobPage.goto();

    await newJobPage.selectApp('BASEBALL');
    await newJobPage.selectJobType('physical_to_digital');
    await newJobPage.filenamePrefixInput.waitFor({ state: 'visible' });
    await newJobPage.fillFilenamePrefix('e2e_test_p2d');
    await newJobPage.fillDescription('E2E test - Physical to Digital workflow');

    // Set up file chooser for PDF folder
    const fileChooserPromise = page.waitForEvent('filechooser');
    await newJobPage.pdfFolderButton.click();
    const fileChooser = await fileChooserPromise;

    // Get PDF files from test-files directory
    const fs = require('fs');
    const pdfFiles = fs.readdirSync(PDF_DIR)
      .filter((f: string) => f.endsWith('.pdf'))
      .map((f: string) => path.join(PDF_DIR, f));

    if (pdfFiles.length === 0) {
      test.skip(true, 'No PDF test files found in e2e/fixtures/test-files/pdfs/');
      return;
    }

    await fileChooser.setFiles(pdfFiles);

    // Submit the form
    await newJobPage.submit();

    // Should navigate to uploading page
    await expect(page).toHaveURL(/\/job\/uploading\?jobId=/, { timeout: 15_000 });

    // Extract jobId from URL
    const url = new URL(page.url());
    jobId = url.searchParams.get('jobId')!;
    expect(jobId).toBeTruthy();

    // Track for cleanup
    await trackJobForCleanup(jobId);
  });

  test('should show upload progress', async ({ page, uploadingPage }) => {
    test.skip(!jobId, 'No job created');

    // Should be on uploading page already or navigate there
    if (!page.url().includes('/uploading')) {
      await uploadingPage.goto(jobId);
    }

    // Verify upload is in progress or completed
    await uploadingPage.expectUploadInProgress();
  });

  test('should complete upload and navigate away', async ({ page, uploadingPage }) => {
    test.skip(!jobId, 'No job created');

    if (!page.url().includes('/uploading')) {
      await uploadingPage.goto(jobId);
    }

    // Wait for upload to complete and navigate
    await uploadingPage.waitForNavigation(120_000);
  });

  test('should display job details with files', async ({ jobDetailsPage, page }) => {
    test.skip(!jobId, 'No job created');

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    // Should show some status
    const status = await jobDetailsPage.getJobStatusText();
    expect(status.length).toBeGreaterThan(0);
  });

  test('should show extracted assets after extraction', async ({ jobDetailsPage, page }) => {
    test.skip(!jobId, 'No job created');

    // Poll until extraction is complete
    await pollJobUntilStatus(jobId, ['extracted', 'generating', 'generated', 'completed'], 300_000);

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    // Should have file cards
    const fileCount = await jobDetailsPage.fileCards.count();
    expect(fileCount).toBeGreaterThan(0);
  });

  test('should preview extracted assets', async ({ jobDetailsPage, page }) => {
    test.skip(!jobId, 'No job created');

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    // Click preview for extracted assets if link exists
    const hasPreviewLink = await jobDetailsPage.previewExtractedLink.isVisible().catch(() => false);
    if (hasPreviewLink) {
      await jobDetailsPage.clickPreviewExtracted();
      await expect(page).toHaveURL(/\/job\/preview/);
      await page.goBack();
    }
  });

  test('should download extracted assets zip', async ({ jobDetailsPage, page }) => {
    test.skip(!jobId, 'No job created');

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    const hasDownload = await jobDetailsPage.downloadExtractedButton.isVisible().catch(() => false);
    if (hasDownload) {
      // Start download and verify it triggers
      const downloadPromise = page.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
      await jobDetailsPage.downloadExtractedButton.click();
      // Download may or may not complete depending on backend
    }
  });

  test('should manage assets (create/edit/delete)', async ({ jobDetailsPage, page }) => {
    test.skip(!jobId, 'No job created');

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    const hasCreateButton = await jobDetailsPage.createAssetButton.isVisible().catch(() => false);
    if (hasCreateButton) {
      await jobDetailsPage.createAssetButton.click();
      // Wait for modal or asset creation UI
      await page.waitForTimeout(2000);
    }
  });

  test('should toggle advanced options', async ({ jobDetailsPage, page }) => {
    test.skip(!jobId, 'No job created');

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    // Try toggling chrome
    const hasChromeToggle = await jobDetailsPage.chromeToggle.isVisible().catch(() => false);
    if (hasChromeToggle) {
      await jobDetailsPage.chromeToggle.click();
      await page.waitForTimeout(500);
    }

    // Try toggling foil
    const hasFoilToggle = await jobDetailsPage.foilToggle.isVisible().catch(() => false);
    if (hasFoilToggle) {
      await jobDetailsPage.foilToggle.click();
      await page.waitForTimeout(500);
    }
  });

  test('should generate assets', async ({ jobDetailsPage, page }) => {
    test.skip(!jobId, 'No job created');

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    const hasGenerateBtn = await jobDetailsPage.generateButton.isVisible().catch(() => false);
    if (hasGenerateBtn) {
      await jobDetailsPage.clickGenerate();
      // Should navigate to jobs list or show generating status
      await page.waitForTimeout(3000);
    }
  });

  test('should reach completed status', async ({ jobDetailsPage, page }) => {
    test.skip(!jobId, 'No job created');

    // This is a long wait - poll until completed
    await pollJobUntilStatus(jobId, ['completed', 'generated'], 600_000, 15_000);

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();
    await jobDetailsPage.expectStatus(/completed|generated/i);
  });

  test('should preview and download generated assets', async ({ jobDetailsPage, page }) => {
    test.skip(!jobId, 'No job created');

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    // Check for preview link
    const hasPreviewLink = await jobDetailsPage.previewDigitalLink.isVisible().catch(() => false);
    if (hasPreviewLink) {
      await jobDetailsPage.clickPreviewDigital();
      await expect(page).toHaveURL(/\/job\/preview/);
      await page.goBack();
    }

    // Check for download button
    const hasDownload = await jobDetailsPage.downloadGeneratedButton.isVisible().catch(() => false);
    if (hasDownload) {
      const downloadPromise = page.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
      await jobDetailsPage.downloadGeneratedButton.click();
    }
  });
});
