import { request } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

async function apiRequest(operation: string, params: Record<string, string> = {}, method = 'GET', body?: any) {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const queryParams = new URLSearchParams({ operation, ...params });
  const url = `/api/content-pipeline-proxy?${queryParams.toString()}`;

  const options: any = {};
  if (method === 'POST' && body) {
    options.data = body;
  }

  const response = method === 'GET'
    ? await ctx.get(url)
    : await ctx.post(url, options);

  const data = await response.json();
  await ctx.dispose();
  return data;
}

export async function getJob(jobId: string) {
  return apiRequest('get_job', { id: jobId });
}

export async function deleteJob(jobId: string) {
  return apiRequest('delete_job', { id: jobId }, 'POST');
}

export async function listJobs() {
  return apiRequest('list_jobs');
}

export async function pollJobUntilStatus(
  jobId: string,
  targetStatuses: string[],
  timeout = 600_000,
  pollInterval = 10_000
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const data = await getJob(jobId);
    const status = data?.job?.job_status || data?.job_status;
    if (targetStatuses.includes(status)) {
      return data;
    }
    // Also check for failure states to fail fast
    if (status?.includes('failed')) {
      throw new Error(`Job ${jobId} entered failure state: ${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  throw new Error(`Job ${jobId} did not reach status [${targetStatuses.join(', ')}] within ${timeout}ms`);
}

/**
 * Track job IDs for cleanup. Writes to a JSON file that global teardown reads.
 */
export async function trackJobForCleanup(jobId: string) {
  const fs = await import('fs');
  const path = await import('path');
  const filePath = path.join(process.cwd(), '.test-job-ids.json');

  let ids: string[] = [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    ids = JSON.parse(content);
  } catch {
    // File doesn't exist yet
  }

  if (!ids.includes(jobId)) {
    ids.push(jobId);
    fs.writeFileSync(filePath, JSON.stringify(ids, null, 2));
  }
}
