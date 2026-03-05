import { test, expect } from './fixtures/app-fixtures';

test.describe('New Job Form', () => {
  test.beforeEach(async ({ newJobPage }) => {
    await newJobPage.goto();
  });

  test('should display all form fields', async ({ newJobPage }) => {
    await newJobPage.expectFormFields();
    await expect(newJobPage.appSelect).toBeVisible();
    await expect(newJobPage.jobTypeSelect).toBeVisible();
    await expect(newJobPage.descriptionTextarea).toBeVisible();
    await expect(newJobPage.submitButton).toBeVisible();
  });

  test('should show validation errors on empty submit', async ({ newJobPage, page }) => {
    await newJobPage.submit();

    // Should show validation errors for required fields
    await newJobPage.expectValidationError(/app name is required/i);
    await newJobPage.expectValidationError(/description is required/i);
  });

  test('App select has correct options', async ({ newJobPage }) => {
    const options = await newJobPage.appSelect.locator('option').allTextContents();
    expect(options.some((o) => /BUNT/i.test(o))).toBeTruthy();
    expect(options.some((o) => /DISNEY/i.test(o))).toBeTruthy();
    expect(options.some((o) => /MARVEL/i.test(o))).toBeTruthy();
    expect(options.some((o) => /SLAM/i.test(o))).toBeTruthy();
    expect(options.some((o) => /STARWARS/i.test(o))).toBeTruthy();
    expect(options.some((o) => /NBA/i.test(o))).toBeTruthy();
    expect(options.some((o) => /NFL/i.test(o))).toBeTruthy();
    expect(options.some((o) => /TTF/i.test(o))).toBeTruthy();
  });

  test('Job Type has correct options', async ({ newJobPage }) => {
    const options = await newJobPage.jobTypeSelect.locator('option').allTextContents();
    expect(options.some((o) => /Physical to Digital/i.test(o))).toBeTruthy();
    expect(options.some((o) => /Silhouette PSD/i.test(o))).toBeTruthy();
    expect(options.some((o) => /Topps Now/i.test(o))).toBeTruthy();
  });

  test('Filename Prefix appears for Physical to Digital', async ({ newJobPage }) => {
    await newJobPage.selectJobType('physical_to_digital');
    await newJobPage.expectFieldnamePrefixVisible();
  });

  test('Filename Prefix appears for Topps Now', async ({ newJobPage }) => {
    await newJobPage.selectJobType('topps_now');
    await newJobPage.expectFieldnamePrefixVisible();
  });

  test('Filename Prefix is hidden for Silhouette PSD', async ({ newJobPage }) => {
    await newJobPage.selectJobType('silhouette_psd');
    await newJobPage.expectFieldnamePrefixHidden();
  });

  test('Job Type is required for submission', async ({ newJobPage }) => {
    await newJobPage.selectApp('BASEBALL');
    await newJobPage.fillDescription('Test description');
    await newJobPage.submit();

    // Should show job type required error
    await newJobPage.expectValidationError(/job type is required/i);
  });
});
