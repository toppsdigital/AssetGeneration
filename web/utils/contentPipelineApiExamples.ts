// Examples of how to use the Content Pipeline API in your job pages
// Import this in your React components to see usage patterns

import contentPipelineApi, { JobData, FileData } from './contentPipelineApi';

// Example 1: Create a new job (use this in your new-job.tsx page)
export async function createNewJob(jobData: {
  appName: string;
  releaseName: string;
  subsetName: string;
  sourceFolder: string;
  files: string[];
  description?: string;
}) {
  try {
    const response = await contentPipelineApi.createJob({
      app_name: jobData.appName,
      release_name: jobData.releaseName,
      source_folder: jobData.sourceFolder,
      files: jobData.files,
      description: jobData.description
    });

    console.log('Job created successfully:', response.job.job_id);
    return response.job;
  } catch (error) {
    console.error('Failed to create job:', error);
    throw error;
  }
}

// Example 1a: Helper function to extract filenames from FileList
export function extractFilenamesFromFileList(fileList: FileList): string[] {
  return Array.from(fileList).map(file => file.name);
}

// Example 1b: Create job with FileList (common pattern in React file uploads)
export async function createNewJobFromFileList(jobData: {
  appName: string;
  releaseName: string;
  subsetName: string;
  sourceFolder: string;
  selectedFiles: FileList;
  description?: string;
}) {
  try {
    const filenames = extractFilenamesFromFileList(jobData.selectedFiles);
    
    const response = await contentPipelineApi.createJob({
      app_name: jobData.appName,
      release_name: jobData.releaseName,
      source_folder: jobData.sourceFolder,
      files: filenames,
      description: jobData.description
    });

    console.log('Job created successfully:', response.job.job_id);
    console.log('Files included:', filenames);
    return response.job;
  } catch (error) {
    console.error('Failed to create job:', error);
    throw error;
  }
}

// Example 2: Get job details (use this in your job/details.tsx page)
export async function getJobDetails(jobId: string) {
  try {
    const response = await contentPipelineApi.getJob(jobId);
    return response.job;
  } catch (error) {
    console.error('Failed to get job details:', error);
    throw error;
  }
}

// Example 3: Update job status (use this during upload/processing)
export async function updateJobProgress(jobId: string, status: string, progress: number, step: string) {
  try {
    const response = await contentPipelineApi.updateJobStatus(jobId, status, progress, step);
    return response.job;
  } catch (error) {
    console.error('Failed to update job status:', error);
    throw error;
  }
}

// Example 4: List recent jobs (use this in your jobs.tsx page)
export async function getRecentJobs(limit: number = 20) {
  try {
    const response = await contentPipelineApi.getRecentJobs(limit);
    return {
      jobs: response.jobs,
      count: response.count,
      performanceMetrics: response.performance_metrics
    };
  } catch (error) {
    console.error('Failed to get recent jobs:', error);
    throw error;
  }
}

// Example 5: Create file records for uploaded PDFs
export async function createFileRecords(files: Array<{
  filename: string;
  size: number;
  sourcePath: string;
  cardNumber?: string;
  side?: 'front' | 'back';
  setCode?: string;
}>) {
  try {
    const fileData: FileData[] = files.map(file => ({
      filename: file.filename,
      file_type: 'PDF',
      size_bytes: file.size,
      source_path: file.sourcePath,
      extracted: 'PENDING',
      status: 'uploaded',
      metadata: {
        card_number: file.cardNumber,
        side: file.side,
        set_code: file.setCode,
        upload_timestamp: new Date().toISOString()
      }
    }));

    const response = await contentPipelineApi.batchCreateFiles(fileData);
    return response;
  } catch (error) {
    console.error('Failed to create file records:', error);
    throw error;
  }
}

// Example 6: Update file status after processing
export async function updateFileAfterExtraction(filename: string, extractedLayers: Record<string, any>) {
  try {
    const response = await contentPipelineApi.updateFile(filename, {
      extracted: 'COMPLETED',
      status: 'processed',
      processing_time_ms: Date.now(), // You'd calculate actual processing time
      extracted_layers: extractedLayers
    });
    return response.file;
  } catch (error) {
    console.error('Failed to update file after extraction:', error);
    throw error;
  }
}

// Example 7: Get files for a specific job (you'd need to implement filtering by job_id)
export async function getJobFiles(jobId: string) {
  try {
    // Note: This would require additional filtering logic or API endpoint
    // For now, this gets all files and you'd filter client-side
    const response = await contentPipelineApi.listFiles({ limit: 100 });
    
    // Filter files that belong to this job (you'd need to store job_id in file metadata)
    const jobFiles = response.files.filter(file => 
      file.metadata?.job_id === jobId
    );
    
    return jobFiles;
  } catch (error) {
    console.error('Failed to get job files:', error);
    throw error;
  }
}

// Example 8: React Hook for job status polling
export function useJobStatus(jobId: string, pollInterval: number = 5000) {
  // This would be implemented in your React component
  // Example implementation:
  /*
  const [jobStatus, setJobStatus] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchJobStatus = async () => {
      try {
        const job = await getJobDetails(jobId);
        setJobStatus(job);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchJobStatus();
    interval = setInterval(fetchJobStatus, pollInterval);

    return () => clearInterval(interval);
  }, [jobId, pollInterval]);

  return { jobStatus, loading, error };
  */
}

// Example 9: Batch status update for multiple files
export async function updateMultipleFileStatuses(updates: Array<{
  filename: string;
  extracted: FileData['extracted'];
  status?: string;
}>) {
  try {
    const promises = updates.map(update => 
      contentPipelineApi.updateFileStatus(update.filename, update.extracted, update.status)
    );
    
    const results = await Promise.allSettled(promises);
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`Updated ${successful} files successfully, ${failed} failed`);
    
    return {
      successful,
      failed,
      results
    };
  } catch (error) {
    console.error('Failed to update multiple file statuses:', error);
    throw error;
  }
}

// Example 10: Error handling wrapper
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorMessage: string
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    console.error(errorMessage, error);
    
    // You could show a toast notification here
    // toast.error(errorMessage);
    
    return null;
  }
} 