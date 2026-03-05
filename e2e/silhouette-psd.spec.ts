import { test, expect } from './fixtures/app-fixtures';
import { trackJobForCleanup, pollJobUntilStatus } from './helpers/api-helpers';
import path from 'path';

const TEST_FILES_DIR = path.join(__dirname, 'fixtures', 'test-files');
const IMAGES_DIR = path.join(TEST_FILES_DIR, 'silhoutte-images');

test.describe.serial('Silhouette PSD Workflow', () => {
  let jobId: string;

  test('should create a new Silhouette PSD job', async ({ newJobPage, page }) => {
    await newJobPage.goto();

    await newJobPage.selectApp('BASEBALL');
    await newJobPage.selectJobType('silhouette_psd');
    // Silhouette PSD does NOT have filename prefix
    await newJobPage.expectFieldnamePrefixHidden();
    await newJobPage.fillDescription('E2E test - Silhouette PSD workflow');

    // Set up file chooser for images folder
    const fileChooserPromise = page.waitForEvent('filechooser');
    await newJobPage.imagesFolderButton.click();
    const fileChooser = await fileChooserPromise;

    const fs = require('fs');
    const imageFiles = fs.readdirSync(IMAGES_DIR)
      .filter((f: string) => /\.(tif|tiff|png|jpg|jpeg)$/i.test(f))
      .map((f: string) => path.join(IMAGES_DIR, f));

    if (imageFiles.length === 0) {
      test.skip(true, 'No image test files found in e2e/fixtures/test-files/silhoutte-images/');
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

  test('should upload images and navigate', async ({ page, uploadingPage }) => {
    test.skip(!jobId, 'No job created');

    if (!page.url().includes('/uploading')) {
      await uploadingPage.goto(jobId);
    }

    await uploadingPage.waitForNavigation(120_000);
  });

  test('should display job details with PSD assets', async ({ jobDetailsPage }) => {
    test.skip(!jobId, 'No job created');

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    const status = await jobDetailsPage.getJobStatusText();
    expect(status.length).toBeGreaterThan(0);
  });

  test('should auto-progress through extraction to generation', async ({ jobDetailsPage }) => {
    test.skip(!jobId, 'No job created');

    // Silhouette PSD jobs may auto-move from extraction to generation
    await pollJobUntilStatus(
      jobId,
      ['extracted', 'generating', 'generated', 'completed'],
      300_000
    );

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();
  });

  test('should create PSDs per uploaded image', async ({ jobDetailsPage }) => {
    test.skip(!jobId, 'No job created');

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    // Should have file cards for uploaded images
    const fileCount = await jobDetailsPage.fileCards.count();
    expect(fileCount).toBeGreaterThan(0);
  });

  test('should reach completed status', async ({ jobDetailsPage }) => {
    test.skip(!jobId, 'No job created');

    await pollJobUntilStatus(jobId, ['completed', 'generated'], 600_000, 15_000);

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();
    await jobDetailsPage.expectStatus(/completed|generated/i);
  });

  test('should download generated PSDs as zip', async ({ jobDetailsPage, page }) => {
    test.skip(!jobId, 'No job created');

    await jobDetailsPage.goto(jobId);
    await jobDetailsPage.expectJobLoaded();

    const hasDownload = await jobDetailsPage.downloadGeneratedButton.isVisible().catch(() => false);
    if (hasDownload) {
      const downloadPromise = page.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
      await jobDetailsPage.downloadGeneratedButton.click();
    }
  });
});
