import { deleteJob } from './helpers/api-helpers';
import * as fs from 'fs';
import * as path from 'path';

async function globalTeardown() {
  const filePath = path.join(process.cwd(), '.test-job-ids.json');

  let ids: string[] = [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    ids = JSON.parse(content);
  } catch {
    console.log('[Teardown] No .test-job-ids.json found, nothing to clean up.');
    return;
  }

  if (ids.length === 0) {
    console.log('[Teardown] No test jobs to clean up.');
    return;
  }

  console.log(`[Teardown] Cleaning up ${ids.length} test job(s)...`);

  for (const jobId of ids) {
    try {
      await deleteJob(jobId);
      console.log(`[Teardown] Deleted job: ${jobId}`);
    } catch (err) {
      console.warn(`[Teardown] Failed to delete job ${jobId}:`, err);
    }
  }

  // Clean up the tracking file
  try {
    fs.unlinkSync(filePath);
    console.log('[Teardown] Removed .test-job-ids.json');
  } catch {
    // Ignore
  }
}

export default globalTeardown;
