import { test, expect } from './fixtures/app-fixtures';
import { trackJobForCleanup, pollJobUntilStatus } from './helpers/api-helpers';
import path from 'path';

const TEST_FILES_DIR = path.join(__dirname, 'fixtures', 'test-files');
const IMAGES_DIR = path.join(TEST_FILES_DIR, 'topps-now-images');

test.describe.serial('Topps Now Workflow', () => {
  let jobId: string;

  test('should create a new Topps Now job', async ({ newJobPage, page }) => {
    await newJobPage.goto();

    await newJobPage.selectApp('BASEBALL');
    await newJobPage.selectJobType('topps_now');
    await newJobPage.filenamePrefixInput.waitFor({ state: 'visible' });
    await newJobPage.fillFilenamePrefix('e2e_test_tn');
    await newJobPage.fillDescription('E2E test - Topps Now workflow');

    // Set up file chooser for images folder
    const fileChooserPromise = page.waitForEvent('filechooser');
    await newJobPage.imagesFolderButton.click();
    const fileChooser = await fileChooserPromise;

    const fs = require('fs');
    const imageFiles = fs.readdirSync(IMAGES_DIR)
      .filter((f: string) => /\.(tif|tiff|png|jpg|jpeg)$/i.test(f))
      .map((f: string) => path.join(IMAGES_DIR, f));

    if (imageFiles.length === 0) {
      test.skip(true, 'No image test files found in e2e/fixtures/test-files/topps-now-images/');
      return;
    }

    await fileChooser.setFiles(imageFiles);

    await newJobPage.submit();
    await expect(page).toHaveURL(/\/job\/uploading\?jobId=/, { timeout: 15_000 });

    const url = new URL(page.url());
    jobId = url.searchParams.get('jobId')!;
    expect(jobId).toBeTruthy();
    await trackJobForCleanup(jobId);
  });

  test('should upload images and navigate to jobs list', async ({ page, uploadingPage }) => {
    test.skip(!jobId, 'No job created');

    if (!page.url().includes('/uploading')) {
      await uploadingPage.goto(jobId);
    }

    await uploadingPage.waitForNavigation(120_000);
  });

  test('should display job details', async ({ jobDetailsPage }) => {
    test.skip(!jobId, 'No job created');

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();
  });

  test('should show extracted assets with parallels', async ({ jobDetailsPage, page }) => {
    test.skip(!jobId, 'No job created');

    // Wait for extraction
    await pollJobUntilStatus(jobId, ['extracted', 'generating', 'generated', 'completed'], 300_000);

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    // Topps Now jobs should have asset configurations with parallels
    const fileCount = await jobDetailsPage.fileCards.count();
    expect(fileCount).toBeGreaterThan(0);
  });

  test('should preview extracted assets', async ({ jobDetailsPage, page }) => {
    test.skip(!jobId, 'No job created');

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    const hasPreview = await jobDetailsPage.previewExtractedLink.isVisible().catch(() => false);
    if (hasPreview) {
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
      await jobDetailsPage.downloadExtractedButton.click();
      await page.waitForTimeout(2000);
    }
  });

  test('should manage assets', async ({ jobDetailsPage, page }) => {
    test.skip(!jobId, 'No job created');

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    const hasCreateButton = await jobDetailsPage.createAssetButton.isVisible().catch(() => false);
    if (hasCreateButton) {
      await jobDetailsPage.createAssetButton.click();
      await page.waitForTimeout(2000);
    }
  });

  test('should generate assets', async ({ jobDetailsPage, page }) => {
    test.skip(!jobId, 'No job created');

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    const hasGenerateBtn = await jobDetailsPage.generateButton.isVisible().catch(() => false);
    if (hasGenerateBtn) {
      await jobDetailsPage.clickGenerate();
      await page.waitForTimeout(3000);
    }
  });

  test('should reach completed status', async ({ jobDetailsPage }) => {
    test.skip(!jobId, 'No job created');

    await pollJobUntilStatus(jobId, ['completed', 'generated'], 600_000, 15_000);

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();
    await jobDetailsPage.expectStatus(/completed|generated/i);
  });

  test('should preview and download generated assets', async ({ jobDetailsPage, page }) => {
    test.skip(!jobId, 'No job created');

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    const hasPreviewLink = await jobDetailsPage.previewDigitalLink.isVisible().catch(() => false);
    if (hasPreviewLink) {
      await jobDetailsPage.clickPreviewDigital();
      await expect(page).toHaveURL(/\/job\/preview/);
      await page.goBack();
    }

    const hasDownload = await jobDetailsPage.downloadGeneratedButton.isVisible().catch(() => false);
    if (hasDownload) {
      await jobDetailsPage.downloadGeneratedButton.click();
    }
  });
});
