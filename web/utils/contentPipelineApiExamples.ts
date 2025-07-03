// Examples of how to use the Content Pipeline API in your job pages
// Import this in your React components to see usage patterns

import contentPipelineApi, { JobData, FileData } from './contentPipelineApi';

// Example 1: Create a new job (use this in your new-job.tsx page)
export async function createNewJob(jobData: {
  appName: string;
  releaseName: string;
  sourceFolder: string;
  files: string[]; // Array of grouped filenames (e.g., ["25TCBB_3800", "25TCBB_3060"])
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

// Example 1a: Helper function to group PDF filenames by removing _FR/_BK suffixes
export function groupPdfFilenames(fileList: FileList): string[] {
  const prefixes = new Set<string>();
  
  Array.from(fileList).forEach(file => {
    const filename = file.name;
    console.log('Processing filename:', filename);
    
    // Remove .pdf extension and _FR/_BK suffixes
    const prefix = filename
      .replace(/\.pdf$/i, '')
      .replace(/_FR$|_BK$/i, '');
    
    prefixes.add(prefix);
    console.log('Extracted prefix:', prefix);
  });
  
  const result = Array.from(prefixes);
  console.log('Final grouped filenames:', result);
  return result;
}

// Example 1b: Create job with FileList (common pattern in React file uploads)
export async function createNewJobFromFileList(jobData: {
  appName: string;
  releaseName: string;
  sourceFolder: string;
  selectedFiles: FileList;
  description?: string;
}) {
  try {
    const groupedFilenames = groupPdfFilenames(jobData.selectedFiles);
    
    const response = await contentPipelineApi.createJob({
      app_name: jobData.appName,
      release_name: jobData.releaseName,
      source_folder: jobData.sourceFolder,
      files: groupedFilenames,
      description: jobData.description
    });

    console.log('Job created successfully:', response.job.job_id);
    console.log('Grouped files:', groupedFilenames);
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

// Example 5: Create file objects with original_files structure (use in job details page)
export async function createFileObjects(jobData: {
  jobId: string;
  appName: string;
  groupedFilenames: string[]; // e.g., ["25TCBB_3800", "25TCBB_3060"]
}) {
  try {
    console.log('Creating file objects for:', jobData.groupedFilenames);
    
    // Create file objects with original_files structure
    const fileObjects = jobData.groupedFilenames.map(filename => {
      const originalFiles = {
        [`${filename}_FR.pdf`]: {
          card_type: 'front' as const,
          file_path: `${jobData.appName}/PDFs/${filename}_FR.pdf`,
          status: 'Uploading' as const
        },
        [`${filename}_BK.pdf`]: {
          card_type: 'back' as const,
          file_path: `${jobData.appName}/PDFs/${filename}_BK.pdf`,
          status: 'Uploading' as const
        }
      };
      
      return {
        filename,
        last_updated: new Date().toISOString(),
        original_files: originalFiles
      };
    });
    
    // Create FileData objects for the API
    const apiFileData: FileData[] = fileObjects.map(fileObj => ({
      filename: fileObj.filename,
      status: 'Uploading',
      metadata: {
        job_id: jobData.jobId,
        original_files: fileObj.original_files
      }
    }));
    
    // Batch create files
    const batchResponse = await contentPipelineApi.batchCreateFiles(apiFileData);
    
    console.log('Batch create response:', batchResponse);
    
    return {
      fileObjects,
      batchResponse
    };
  } catch (error) {
    console.error('Failed to create file objects:', error);
    throw error;
  }
}

// Example 6: Update individual PDF file status after upload
export async function updatePdfFileStatus(
  filename: string, // The grouped filename (e.g., "25TCBB_3800")
  pdfFilename: string, // The actual PDF filename (e.g., "25TCBB_3800_FR.pdf")
  status: 'Uploading' | 'Uploaded' | 'Failed',
  originalFiles: Record<string, any>
) {
  try {
    // Update the file in the API
    const updates = {
      status: status,
      metadata: {
        original_files: {
          ...originalFiles,
          [pdfFilename]: {
            ...originalFiles[pdfFilename],
            status: status
          }
        }
      }
    };
    
    const response = await contentPipelineApi.updateFile(filename, updates);
    
    console.log(`Updated ${pdfFilename} status to ${status} for file ${filename}`);
    return response.file;
  } catch (error) {
    console.error(`Failed to update file status for ${pdfFilename}:`, error);
    throw error;
  }
}

// Example 7: Get files for a specific job using metadata filtering
export async function getJobFiles(jobId: string) {
  try {
    // Get all files and filter by job_id in metadata
    const response = await contentPipelineApi.listFiles({ limit: 100 });
    
    // Filter files that belong to this job
    const jobFiles = response.files.filter(file => 
      file.metadata?.job_id === jobId
    );
    
    return jobFiles;
  } catch (error) {
    console.error('Failed to get job files:', error);
    throw error;
  }
}

// Example 8: React Hook for job status polling with file creation
export function useJobWithFileCreation(jobId: string, pollInterval: number = 5000) {
  // This would be implemented in your React component
  // Example implementation:
  /*
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [contentPipelineFiles, setContentPipelineFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filesCreated, setFilesCreated] = useState(false);

  useEffect(() => {
    const loadJobAndCreateFiles = async () => {
      try {
        const job = await getJobDetails(jobId);
        setJobData(job);
        
        // Create file objects if not already created
        if (job.files && job.files.length > 0 && !filesCreated) {
          const result = await createFileObjects({
            jobId: job.job_id!,
            appName: job.app_name,
            groupedFilenames: job.files
          });
          
          setContentPipelineFiles(result.fileObjects);
          setFilesCreated(true);
        }
        
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadJobAndCreateFiles();
    const interval = setInterval(loadJobAndCreateFiles, pollInterval);

    return () => clearInterval(interval);
  }, [jobId, pollInterval, filesCreated]);

  return { jobData, contentPipelineFiles, loading, error };
  */
}

// Example 9: Batch update multiple PDF file statuses
export async function updateMultiplePdfStatuses(updates: Array<{
  filename: string; // Grouped filename
  pdfFilename: string; // Actual PDF filename
  status: 'Uploading' | 'Uploaded' | 'Failed';
  originalFiles: Record<string, any>;
}>) {
  try {
    const promises = updates.map(update => 
      updatePdfFileStatus(update.filename, update.pdfFilename, update.status, update.originalFiles)
    );
    
    const results = await Promise.allSettled(promises);
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`Updated ${successful} PDF files successfully, ${failed} failed`);
    
    return {
      successful,
      failed,
      results
    };
  } catch (error) {
    console.error('Failed to update multiple PDF file statuses:', error);
    throw error;
  }
}

// Example 10: Complete upload workflow
export async function completeUploadWorkflow(jobId: string, uploadedFiles: File[]) {
  try {
    // 1. Update job status to uploading
    await updateJobProgress(jobId, 'Upload in progress', 0, 'Starting file upload');
    
    // 2. Upload each file and update status
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      const progress = Math.round(((i + 1) / uploadedFiles.length) * 100);
      
      // Update job progress
      await updateJobProgress(jobId, 'Upload in progress', progress, `Uploading ${file.name}`);
      
      // Here you would do the actual S3 upload
      // await uploadToS3(file);
      
      // Update individual file status
      // await updatePdfFileStatus(groupedFilename, file.name, 'Uploaded', originalFiles);
    }
    
    // 3. Complete the upload
    await updateJobProgress(jobId, 'Upload completed', 100, 'All files uploaded successfully');
    
    console.log('Upload workflow completed successfully');
  } catch (error) {
    console.error('Upload workflow failed:', error);
    await updateJobProgress(jobId, 'Upload failed', undefined, 'Upload process failed');
    throw error;
  }
}

// Example 11: Error handling wrapper with user feedback
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorMessage: string,
  showToast?: (message: string, type: 'error' | 'success') => void
): Promise<T | null> {
  try {
    const result = await operation();
    showToast?.(`Operation completed successfully`, 'success');
    return result;
  } catch (error) {
    console.error(errorMessage, error);
    
    const userMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    showToast?.(`${errorMessage}: ${userMessage}`, 'error');
    
    return null;
  }
} 