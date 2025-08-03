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
    const updated = updater(old) as UIJobData;
    console.log('🔄 Updated job detail cache:', { old: old, new: updated });
    return updated;
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
  
  // CRITICAL: Invalidate queries to trigger re-renders
  queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
  queryClient.invalidateQueries({ queryKey: jobKeys.all });
  
  console.log('✅ Job data synchronized and invalidated for job:', jobId);
}

// Cache clearing utility for rerun operations
export function createCacheClearingCallback(queryClient: QueryClient) {
  return (sourceJobId: string, newJobId: string, deletedFiles?: string[]) => {
    console.log('🗑️ Clearing caches for rerun operation:', { 
      sourceJobId, 
      newJobId, 
      deletedFilesCount: deletedFiles?.length || 0 
    });
    
    // Clear source job cache (the job being re-run)
    queryClient.removeQueries({ queryKey: jobKeys.detail(sourceJobId) });
    queryClient.removeQueries({ queryKey: jobKeys.files(sourceJobId) });
    
    // Clear all job-related caches to ensure no stale data
    queryClient.removeQueries({ queryKey: jobKeys.all });
    queryClient.removeQueries({ queryKey: jobKeys.lists() });
    queryClient.removeQueries({ queryKey: jobKeys.details() });
    
    // Clear caches for specifically deleted files
    if (deletedFiles && deletedFiles.length > 0) {
      console.log('🗑️ Clearing caches for specifically deleted files:', deletedFiles);
      
      deletedFiles.forEach(deletedFile => {
        // Clear any cache that might reference this specific file
        queryClient.removeQueries({ 
          predicate: (query) => {
            const queryKey = query.queryKey;
            return queryKey.some(key => 
              typeof key === 'string' && (
                key.includes(deletedFile) ||
                key.includes(deletedFile.replace('.pdf', '')) // Also check without extension
              )
            );
          }
        });
      });
    }
    
    // Clear any potential file-related caches that might exist
    // This ensures deleted files don't have cached data lingering
    queryClient.removeQueries({ 
      predicate: (query) => {
        const queryKey = query.queryKey;
        // Clear any query that references the source job ID
        return queryKey.some(key => 
          typeof key === 'string' && key.includes(sourceJobId)
        );
      }
    });
    
    // Clear any upload-related or session caches
    queryClient.removeQueries({ 
      predicate: (query) => {
        const queryKey = query.queryKey;
        // Clear any file or upload related queries
        return queryKey.some(key => 
          typeof key === 'string' && (
            key.includes('files') || 
            key.includes('upload') || 
            key.includes('batch')
          )
        );
      }
    });
    
    console.log('✅ Comprehensive cache clearing completed for rerun operation');
    console.log('🗑️ Cleared caches for deleted files and all related data');
    console.log(`📊 Processed ${deletedFiles?.length || 0} deleted files for cache clearing`);
  };
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
        Subset_name: response.job.source_folder
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

// Download archive interface
export interface DownloadArchive {
  download_url: string;
  expires_in: number;
  zip_key: string;
  source_folder: string;
  files_count: number;
}

// Hook for fetching download archive with expiry-based caching
export function useDownloadArchive(jobId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: [...jobKeys.detail(jobId || ''), 'download-archive'] as const,
    queryFn: async (): Promise<DownloadArchive> => {
      if (!jobId) throw new Error('Job ID is required');
      
      console.log('🔄 Creating download archive for job:', jobId);
      const response = await contentPipelineApi.downloadJobOutputFolder(jobId);
      
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to create download archive');
      }
      
      console.log('✅ Download archive created:', {
        files_count: response.data.files_count,
        expires_in: response.data.expires_in,
        cache_duration: response.data.expires_in * 1000 * 0.9
      });
      
      return response.data;
    },
    enabled: enabled && !!jobId,
    staleTime: 30 * 60 * 1000, // Consider fresh for 30 minutes (most download links last 1 hour)
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
    refetchOnWindowFocus: false, // Don't refetch on focus since archive creation is expensive
    retry: (failureCount, error) => {
      // Don't retry on 404s or if no files found
      if (error instanceof Error && (
        error.message.includes('404') || 
        error.message.includes('No files found')
      )) {
        return false;
      }
      return failureCount < 2; // Limited retries for archive creation
    }
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
    filename_prefix: params.releaseName || '', // Map releaseName to filename_prefix for backward compatibility
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