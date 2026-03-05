import { test as base } from '@playwright/test';
import { HomePage } from '../page-objects/home.page';
import { JobsPage } from '../page-objects/jobs.page';
import { NewJobPage } from '../page-objects/new-job.page';
import { UploadingPage } from '../page-objects/uploading.page';
import { JobDetailsPage } from '../page-objects/job-details.page';
import { JobPreviewPage } from '../page-objects/job-preview.page';
import { PendingJobsPage } from '../page-objects/pending-jobs.page';

type AppFixtures = {
  homePage: HomePage;
  jobsPage: JobsPage;
  newJobPage: NewJobPage;
  uploadingPage: UploadingPage;
  jobDetailsPage: JobDetailsPage;
  jobPreviewPage: JobPreviewPage;
  pendingJobsPage: PendingJobsPage;
};

export const test = base.extend<AppFixtures>({
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  jobsPage: async ({ page }, use) => {
    await use(new JobsPage(page));
  },
  newJobPage: async ({ page }, use) => {
    await use(new NewJobPage(page));
  },
  uploadingPage: async ({ page }, use) => {
    await use(new UploadingPage(page));
  },
  jobDetailsPage: async ({ page }, use) => {
    await use(new JobDetailsPage(page));
  },
  jobPreviewPage: async ({ page }, use) => {
    await use(new JobPreviewPage(page));
  },
  pendingJobsPage: async ({ page }, use) => {
    await use(new PendingJobsPage(page));
  },
});

export { expect } from '@playwright/test';
