import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { contentPipelineApi, JobData, FileData } from '../utils/contentPipelineApi';

// Job query keys for consistent caching
export const jobKeys = {
  all: ['jobs'] as const,
  lists: () => [...jobKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...jobKeys.lists(), { filters }] as const,
  details: () => [...jobKeys.all, 'detail'] as const,
  detail: (id: string) => [...jobKeys.details(), id] as const,
  files: (id: string) => [...jobKeys.detail(id), 'files'] as const,
};

// Utility function to synchronize job data across all caches
export function syncJobDataAcrossCaches(
  queryClient: QueryClient, 
  jobId: string, 
  updater: (job: UIJobData | JobData) => UIJobData | JobData
) {
  console.log('🔄 Syncing job data across caches for job:', jobId);
  
  // Update individual job detail cache
  queryClient.setQueryData(jobKeys.detail(jobId), (old: UIJobData | undefined) => {
    if (!old) return old;
    return updater(old) as UIJobData;
  });
  
  // Update jobs list cache
  queryClient.setQueryData(jobKeys.all, (old: JobData[] | undefined) => {
    if (!old) return old;
    return old.map(job => 
      job.job_id === jobId 
        ? updater(job) as JobData
        : job
    );
  });
  
  console.log('✅ Job data synchronized across all caches for job:', jobId);
}

// Extended job data interface for UI compatibility
export interface UIJobData extends JobData {
  psd_file?: string;
  template?: string;
  total_files?: number;
  timestamp?: string;
  Subset_name?: string;
  job_path?: string;
  api_files?: string[];
  content_pipeline_files?: FileData[];
}

// Hook for fetching job details with smart caching
export function useJobData(jobId: string | null) {
  return useQuery({
    queryKey: jobKeys.detail(jobId || ''),
    queryFn: async (): Promise<UIJobData> => {
      if (!jobId) throw new Error('Job ID is required');
      
      console.log('🔄 Fetching job data from API for:', jobId);
      const response = await contentPipelineApi.getJob(jobId);
      
      // Map API response to UI interface
      const mappedData: UIJobData = {
        ...response.job,
        api_files: response.job.files,
        files: [],
        content_pipeline_files: [],
        Subset_name: response.job.subset_name || response.job.source_folder
      };
      
      console.log('✅ Job data fetched and mapped:', mappedData);
      return mappedData;
    },
    enabled: !!jobId,
    staleTime: 5 * 1000, // Consider fresh for only 5 seconds to ensure quick updates
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchOnWindowFocus: true, // Refresh when tab becomes active
    retry: (failureCount, error) => {
      // Don't retry on 404s, but retry on network errors
      if (error instanceof Error && error.message.includes('404')) {
        return false;
      }
      return failureCount < 3;
    }
  });
}

// Hook for fetching job files separately (for future implementation)
export function useJobFiles(jobId: string | null, apiFiles: string[] = [], enabled: boolean = true) {
  console.log('🔍 useJobFiles called with:', {
    jobId,
    apiFilesCount: apiFiles.length,
    enabled,
    willExecute: enabled && !!jobId && apiFiles.length > 0
  });
  
  return useQuery({
    queryKey: jobKeys.files(jobId || ''),
    queryFn: async (): Promise<FileData[]> => {
      if (!jobId || apiFiles.length === 0) return [];
      
      console.log('🔄 Fetching file objects for job:', jobId, 'files:', apiFiles);
      const response = await contentPipelineApi.batchGetFiles(apiFiles);
      
      if (!response.files || !Array.isArray(response.files)) {
        throw new Error('Invalid response format from API');
      }
      
      const fileObjects: FileData[] = response.files.map(apiFile => ({
        filename: apiFile.filename,
        job_id: apiFile.job_id,
        last_updated: apiFile.last_updated || new Date().toISOString(),
        original_files: apiFile.original_files || {},
        extracted_files: apiFile.extracted_files || {},
        firefly_assets: apiFile.firefly_assets || {}
      }));
      
      console.log('✅ File objects fetched:', fileObjects.length);
      return fileObjects;
    },
    enabled: enabled && !!jobId && apiFiles.length > 0,
    staleTime: 15 * 1000, // Files change more frequently, consider fresh for 15 seconds
    gcTime: 3 * 60 * 1000, // Keep in cache for 3 minutes
  });
}

// Hook for updating job status with optimistic updates and cache synchronization
export function useUpdateJobStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ jobId, status }: { jobId: string; status: JobData['job_status'] }) => {
      console.log('🔄 Updating job status:', { jobId, status });
      const response = await contentPipelineApi.updateJobStatus(jobId, status);
      return response.job;
    },
    onMutate: async ({ jobId, status }) => {
      // Cancel any outgoing refetches for both caches
      await queryClient.cancelQueries({ queryKey: jobKeys.detail(jobId) });
      await queryClient.cancelQueries({ queryKey: jobKeys.all });
      
      // Snapshot the previous values
      const previousJob = queryClient.getQueryData<UIJobData>(jobKeys.detail(jobId));
      const previousJobsList = queryClient.getQueryData<JobData[]>(jobKeys.all);
      
      // Optimistically update the individual job cache
      queryClient.setQueryData<UIJobData>(jobKeys.detail(jobId), (old) => {
        if (!old) return old;
        return { ...old, job_status: status };
      });
      
      // Optimistically update the jobs list cache
      queryClient.setQueryData<JobData[]>(jobKeys.all, (old) => {
        if (!old) return old;
        return old.map(job => 
          job.job_id === jobId 
            ? { ...job, job_status: status }
            : job
        );
      });
      
      console.log('🔄 Optimistically updated both job detail and jobs list caches for job:', jobId);
      
      // Return a context object with the snapshotted values
      return { previousJob, previousJobsList };
    },
    onError: (err, { jobId }, context) => {
      console.error('❌ Job status update failed, rolling back optimistic updates:', err);
      
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousJob) {
        queryClient.setQueryData(jobKeys.detail(jobId), context.previousJob);
      }
      if (context?.previousJobsList) {
        queryClient.setQueryData(jobKeys.all, context.previousJobsList);
      }
    },
    onSuccess: (updatedJob, { jobId }) => {
      console.log('✅ Job status update successful, syncing final data across caches');
      
      // Update both caches with the actual server response
      queryClient.setQueryData<UIJobData>(jobKeys.detail(jobId), (old) => {
        if (!old) return old;
        return { ...old, ...updatedJob };
      });
      
      queryClient.setQueryData<JobData[]>(jobKeys.all, (old) => {
        if (!old) return old;
        return old.map(job => 
          job.job_id === jobId 
            ? { ...job, ...updatedJob }
            : job
        );
      });
    },
    onSettled: (data, error, { jobId }) => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
      
      console.log('🔄 Cache invalidation completed for both job detail and jobs list');
    },
  });
}

// Utility to create job data from query parameters (for navigation from job list)
export function createJobDataFromParams(params: {
  jobId: string;
  appName?: string;
  releaseName?: string;
  subsetName?: string;
  sourceFolder?: string;
  status?: string;
  createdAt?: string;
  files?: string;
  description?: string;
}): UIJobData {
  let parsedFiles: string[] = [];
  try {
    parsedFiles = params.files ? JSON.parse(params.files) : [];
  } catch (e) {
    console.warn('Failed to parse files from query params:', e);
  }
  
  return {
    job_id: params.jobId,
    app_name: params.appName || '',
    release_name: params.releaseName || '',
    subset_name: params.subsetName || '',
    source_folder: params.sourceFolder || '',
    job_status: (params.status as JobData['job_status']) || 'uploading',
    created_at: params.createdAt || new Date().toISOString(),
    description: params.description || '',
    api_files: parsedFiles,
    files: [],
    content_pipeline_files: [],
    Subset_name: params.subsetName || params.sourceFolder || ''
  };
} 