// Centralized App Data Store Hook
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { contentPipelineApi } from '../web/utils/contentPipelineApi';
import { 
  AppDataStoreReturn, 
  DataSelector, 
  SelectorOptions, 
  MutationPayload,
  MutationType,
  UIJobData,
  DEFAULT_DATA_STORE_CONFIG,
  DataStoreConfig,
  JOB_STATUS_CATEGORIES
} from './useAppDataStore.types';
import type { FileData } from '../web/utils/contentPipelineApi';
import AppDataStoreConfig, { ConfigHelpers, DEBUG_CONFIG } from './useAppDataStore.config';

// Centralized query keys
export const dataStoreKeys = {
  // Jobs
  jobs: {
    all: ['datastore', 'jobs'] as const,
    lists: () => [...dataStoreKeys.jobs.all, 'list'] as const,
    list: (filters: Record<string, any>) => [...dataStoreKeys.jobs.lists(), { filters }] as const,
    details: () => [...dataStoreKeys.jobs.all, 'detail'] as const,
    detail: (id: string) => [...dataStoreKeys.jobs.details(), id] as const,
    batch: (ids: string[]) => [...dataStoreKeys.jobs.all, 'batch', ids.sort()] as const, // Sort for consistent cache key
  },
  
  // Files
  files: {
    all: ['datastore', 'files'] as const,
    byJob: (jobId: string) => [...dataStoreKeys.files.all, 'job', jobId] as const,
    detail: (filename: string) => [...dataStoreKeys.files.all, 'detail', filename] as const,
  },
  
  // Assets
  assets: {
    all: ['datastore', 'assets'] as const,
    byJob: (jobId: string) => [...dataStoreKeys.assets.all, 'job', jobId] as const,
  },
  
  // Download URLs
  downloads: {
    all: ['datastore', 'downloads'] as const,
    byJob: (jobId: string) => [...dataStoreKeys.downloads.all, 'job', jobId] as const,
  },
} as const;

/**
 * Main App Data Store Hook
 * Provides centralized data management with intelligent caching and auto-refresh
 */
export function useAppDataStore<T = any>(
  selector: DataSelector,
  options: SelectorOptions = {},
  config: Partial<DataStoreConfig> = {}
): AppDataStoreReturn<T> {
  
  const queryClient = useQueryClient();
  const pathname = usePathname();
  // React Query now handles polling internally via refetchInterval
  
  // Define pages where auto-refresh is allowed
  const isAutoRefreshAllowedOnPage = AppDataStoreConfig.ALLOWED_AUTO_REFRESH_PAGES.includes(pathname as any);
  
  // Merge config with centralized configuration and user overrides
  const finalConfig = useMemo(() => ({
    autoRefresh: {
      enabled: config.autoRefresh?.enabled ?? DEFAULT_DATA_STORE_CONFIG.autoRefresh.enabled,
      intervals: {
        activeJobs: config.autoRefresh?.intervals?.activeJobs ?? AppDataStoreConfig.AUTO_REFRESH_INTERVALS.INDIVIDUAL_JOB,
        jobsList: config.autoRefresh?.intervals?.jobsList ?? AppDataStoreConfig.AUTO_REFRESH_INTERVALS.JOBS_LIST,
      },
    },
    cache: {
      staleTime: {
        jobs: config.cache?.staleTime?.jobs ?? AppDataStoreConfig.CACHE_CONFIG.STALE_TIME.jobs,
        files: config.cache?.staleTime?.files ?? AppDataStoreConfig.CACHE_CONFIG.STALE_TIME.files,
        assets: config.cache?.staleTime?.assets ?? AppDataStoreConfig.CACHE_CONFIG.STALE_TIME.assets,
        jobsList: config.cache?.staleTime?.jobsList ?? AppDataStoreConfig.CACHE_CONFIG.STALE_TIME.jobsList,
      },
      gcTime: {
        jobs: config.cache?.gcTime?.jobs ?? AppDataStoreConfig.CACHE_CONFIG.GARBAGE_COLLECTION_TIME.jobs,
        files: config.cache?.gcTime?.files ?? AppDataStoreConfig.CACHE_CONFIG.GARBAGE_COLLECTION_TIME.files,
        assets: config.cache?.gcTime?.assets ?? AppDataStoreConfig.CACHE_CONFIG.GARBAGE_COLLECTION_TIME.assets,
        jobsList: config.cache?.gcTime?.jobsList ?? AppDataStoreConfig.CACHE_CONFIG.GARBAGE_COLLECTION_TIME.jobsList,
      },
    },
    retry: {
      attempts: config.retry?.attempts ?? AppDataStoreConfig.RETRY_CONFIG.MAX_ATTEMPTS,
      backoffMultiplier: config.retry?.backoffMultiplier ?? AppDataStoreConfig.RETRY_CONFIG.BACKOFF_MULTIPLIER,
    },
  }), [config]);

  // Generate query key based on selector and options
  const queryKey = useMemo(() => {
    switch (selector) {
      case 'jobs':
        return dataStoreKeys.jobs.list(options.filters || {});
      case 'jobDetails':
        return options.jobId ? dataStoreKeys.jobs.detail(options.jobId) : [];
      case 'jobFiles':
        return options.jobId ? dataStoreKeys.files.byJob(options.jobId) : [];
      case 'jobAssets':
        return options.jobId ? dataStoreKeys.assets.byJob(options.jobId) : [];
      case 'downloadUrl':
        return options.jobId ? dataStoreKeys.downloads.byJob(options.jobId) : [];
      case 'batchJobs':
        return options.jobIds && options.jobIds.length > 0 ? dataStoreKeys.jobs.batch(options.jobIds) : [];
      default:
        return [];
    }
  }, [selector, options.filters, options.jobId, options.jobIds]);

  // Query function based on selector
  const queryFn = useCallback(async (): Promise<T> => {
    if (selector === 'jobs') {
      console.log(`🔄 [DataStore] Fetching fresh jobs data:`, {
        userFilter: options.filters?.userFilter,
        statusFilter: options.filters?.statusFilter,
        autoRefresh: options.autoRefresh,
        timestamp: new Date().toLocaleTimeString()
      });
    }
    
    switch (selector) {
      case 'jobs': {
        const filterOptions: any = {};
        
        if (options.filters?.userFilter === 'my') {
          filterOptions.my_jobs = true;
        }
        
        if (options.filters?.statusFilter === 'in-progress') {
          filterOptions.status = 'in-progress';
        } else if (options.filters?.statusFilter === 'completed') {
          filterOptions.status = 'completed';
        }
        
        const response = await contentPipelineApi.listJobs(filterOptions);
        
        // Sort jobs by creation date (most recent first)
        const sortedJobs = response.jobs.sort((a, b) => 
          new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
        );
        
        console.log(`✅ [DataStore] Fetched ${sortedJobs.length} jobs`);
        return sortedJobs as T;
      }
      
      case 'jobDetails': {
        if (!options.jobId) throw new Error('Job ID is required for jobDetails selector');
        
        const response = await contentPipelineApi.getJob(options.jobId);
        const mappedData: UIJobData = {
          ...response.job,
          api_files: response.job.files,
          files: [],
          content_pipeline_files: [],
          Subset_name: response.job.source_folder
        };
        
        // Optionally fetch related data
        if (options.includeFiles && mappedData.api_files?.length) {
          try {
            const filesResponse = await contentPipelineApi.batchGetFiles(mappedData.api_files);
            mappedData.content_pipeline_files = filesResponse.files.map(apiFile => ({
              filename: apiFile.filename,
              job_id: apiFile.job_id,
              last_updated: apiFile.last_updated || new Date().toISOString(),
              original_files: apiFile.original_files || {},
              extracted_files: apiFile.extracted_files || {},
              firefly_assets: apiFile.firefly_assets || {}
            }));
          } catch (error) {
            console.warn(`⚠️ [DataStore] Failed to fetch files for job ${options.jobId}:`, error);
          }
        }
        
        if (options.includeAssets) {
          try {
            const assetsResponse = await contentPipelineApi.getAssets(options.jobId);
            mappedData.assets = assetsResponse.assets;
          } catch (error) {
            console.warn(`⚠️ [DataStore] Failed to fetch assets for job ${options.jobId}:`, error);
          }
        }
        
        console.log(`✅ [DataStore] Fetched job details for ${options.jobId}`);
        return mappedData as T;
      }
      
      case 'jobFiles': {
        if (!options.jobId) throw new Error('Job ID is required for jobFiles selector');
        
        // First get the job to find the file list
        const jobResponse = await contentPipelineApi.getJob(options.jobId);
        const apiFiles = jobResponse.job.files || [];
        
        if (apiFiles.length === 0) {
          console.log(`📁 [DataStore] No files found for job ${options.jobId}`);
          return [] as T;
        }
        
        const filesResponse = await contentPipelineApi.batchGetFiles(apiFiles);
        const fileObjects: FileData[] = filesResponse.files.map(apiFile => ({
          filename: apiFile.filename,
          job_id: apiFile.job_id,
          last_updated: apiFile.last_updated || new Date().toISOString(),
          original_files: apiFile.original_files || {},
          extracted_files: apiFile.extracted_files || {},
          firefly_assets: apiFile.firefly_assets || {}
        }));
        
        console.log(`✅ [DataStore] Fetched ${fileObjects.length} files for job ${options.jobId}`);
        return fileObjects as T;
      }
      
      case 'jobAssets': {
        if (!options.jobId) throw new Error('Job ID is required for jobAssets selector');
        
        const response = await contentPipelineApi.getAssets(options.jobId);
        console.log(`✅ [DataStore] Fetched assets for job ${options.jobId}`);
        return response.assets as T;
      }
      
      case 'downloadUrl': {
        if (!options.jobId) throw new Error('Job ID is required for downloadUrl selector');
        
        // Check if job has stored download URL first
        const jobResponse = await contentPipelineApi.getJob(options.jobId);
        const job = jobResponse.job;
        
        // Check if stored URL is still valid (expires within 5 minutes)
        if (job.download_url && job.download_url_expires) {
          const expiryTime = new Date(job.download_url_expires).getTime();
          const now = Date.now();
          const fiveMinutes = 5 * 60 * 1000;
          
          if (expiryTime > now + fiveMinutes) {
            console.log(`✅ [DataStore] Using stored download URL for job ${options.jobId}`);
            return {
              download_url: job.download_url,
              expires: job.download_url_expires,
              created: job.download_url_created
            } as T;
          }
        }
        
        // Generate new download URL
        console.log(`🔄 [DataStore] Generating fresh download URL for job ${options.jobId}`);
        const response = await contentPipelineApi.downloadJobOutputFolder(options.jobId);
        
        if (!response.success || !response.data) {
          throw new Error(response.message || 'Failed to create download URL');
        }
        
        console.log(`✅ [DataStore] Generated fresh download URL for job ${options.jobId}`);
        return {
          download_url: response.data.download_url,
          expires: new Date(Date.now() + response.data.expires_in * 1000).toISOString(),
          created: new Date().toISOString(),
          files_count: response.data.files_count
        } as T;
      }
      
      case 'batchJobs': {
        if (!options.jobIds || options.jobIds.length === 0) {
          console.log(`📋 [DataStore] No job IDs provided for batch fetch`);
          return { jobs: [], found_count: 0, not_found_job_ids: [], total_requested: 0, unprocessed_count: 0 } as T;
        }
        
        console.log(`🔄 [DataStore] Batch fetching ${options.jobIds.length} jobs:`, options.jobIds);
        const response = await contentPipelineApi.batchGetJobs(options.jobIds);
        
        // Transform jobs to match the expected UI format
        const transformedJobs = response.jobs.map(job => ({
          ...job,
          api_files: job.files,
          files: [],
          content_pipeline_files: [],
          Subset_name: job.source_folder
        }));
        
        console.log(`✅ [DataStore] Batch fetched ${response.found_count}/${response.total_requested} jobs`);
        if (response.not_found_job_ids.length > 0) {
          console.warn(`⚠️ [DataStore] Jobs not found:`, response.not_found_job_ids);
        }
        
        return { ...response, jobs: transformedJobs } as T;
      }
      
      default:
        throw new Error(`Unknown selector: ${selector}`);
    }
  }, [selector, options]);

  // Determine cache settings based on selector
  const cacheSettings = useMemo(() => {
    const { staleTime, gcTime } = finalConfig.cache;
    switch (selector) {
      case 'jobs':
        // Use moderate staleTime to show cached data immediately while fetching fresh data in background
        return { staleTime: 5 * 1000, gcTime: gcTime.jobsList }; // 5 seconds stale time
      case 'jobDetails':
        return { staleTime: staleTime.jobs, gcTime: gcTime.jobs };
      case 'jobFiles':
        return { staleTime: staleTime.files, gcTime: gcTime.files };
      case 'jobAssets':
        return { staleTime: staleTime.assets, gcTime: gcTime.assets };
      case 'downloadUrl':
        return { staleTime: 30 * 60 * 1000, gcTime: 60 * 60 * 1000 }; // 30min/1hr for download URLs
      case 'batchJobs':
        return { staleTime: 0, gcTime: gcTime.jobs }; // Fresh data for batch polling
      default:
        return { staleTime: staleTime.jobs, gcTime: gcTime.jobs };
    }
  }, [selector, finalConfig.cache]);

  // Main React Query hook
  const {
    data,
    isLoading,
    isFetching: isRefreshing,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn,
    enabled: queryKey.length > 0,
    staleTime: cacheSettings.staleTime,
    gcTime: cacheSettings.gcTime,
    refetchOnWindowFocus: false,
    refetchOnMount: selector === 'jobs' ? true : false, // Show cached data immediately, then fetch fresh data in background
    // This combination ensures: cached data shown instantly + fresh data fetched in background
    // Use React Query's built-in polling instead of manual timers
    refetchInterval: (data) => {
      if (!options.autoRefresh || !finalConfig.autoRefresh.enabled || !isAutoRefreshAllowedOnPage) {
        if (!isAutoRefreshAllowedOnPage && DEBUG_CONFIG.ENABLE_AUTO_REFRESH_LOGGING) {
          console.log(`⏸️ [DataStore] Auto-refresh disabled - page ${pathname} not in allowed list:`, AppDataStoreConfig.ALLOWED_AUTO_REFRESH_PAGES);
        }
        return false; // Disable polling
      }
      
      if (selector === 'jobs') {
        // Jobs list always polls every 30 seconds when enabled (regardless of filters)
        const interval = finalConfig.autoRefresh.intervals.jobsList;
        if (DEBUG_CONFIG.ENABLE_AUTO_REFRESH_LOGGING) {
          console.log(`⏰ [DataStore] Jobs list auto-refresh active: ${interval}ms interval, filters:`, {
            userFilter: options.filters?.userFilter,
            statusFilter: options.filters?.statusFilter
          });
        }
        return interval;
      }
      
      if (selector === 'jobDetails' && data) {
        const job = data as any; // Type will be validated at runtime
        const jobStatus = job?.job_status || '';
        
        // Check if this job status should never poll (e.g., 'completed')
        const shouldNeverPoll = ConfigHelpers.shouldJobNeverPoll(jobStatus);
        if (shouldNeverPoll) {
          console.log(`⏹️ [DataStore] Stopping polling - job ${options.jobId} is ${jobStatus} (completed/terminal status)`);
          return false; // Stop polling completely
        }
        
        // For all non-completed jobs, poll every 5 seconds
        const interval = finalConfig.autoRefresh.intervals.activeJobs; // 5000ms = 5 seconds
        console.log(`🔄 [DataStore] Polling non-completed job ${options.jobId} (${jobStatus}) every ${interval}ms`);
        return interval;
      }
      
      if (selector === 'batchJobs' && data) {
        const batchData = data as any; // BatchJobsResponse type
        if (!batchData.jobs || batchData.jobs.length === 0) {
          return 5000; // Still poll if no jobs found
        }
        
        // Check if any of the returned jobs should still be polled
        const shouldContinuePolling = batchData.jobs.some((job: any) => {
          const jobStatus = job?.job_status || '';
          return !ConfigHelpers.shouldJobNeverPoll(jobStatus);
        });
        
        if (!shouldContinuePolling) {
          console.log(`⏹️ [DataStore] Stopping batch polling - all jobs completed`);
          return false;
        }
        
        const interval = finalConfig.autoRefresh.intervals.activeJobs; // 5000ms = 5 seconds
        if (DEBUG_CONFIG.ENABLE_AUTO_REFRESH_LOGGING) {
          console.log(`🔄 [DataStore] Batch polling ${batchData.jobs.length} non-completed jobs every ${interval}ms`);
        }
        return interval;
      }
      
      // Default: no polling for other selectors unless specifically configured
      return false;
    },
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes('404')) {
        return false;
      }
      return failureCount < finalConfig.retry.attempts;
    },
    retryDelay: (attemptIndex) => 
      Math.min(1000 * Math.pow(finalConfig.retry.backoffMultiplier, attemptIndex), 30000),
  });

  // Mutation hook for data modifications
  const { mutate: performMutation, isPending: isMutating } = useMutation({
    mutationFn: async (payload: MutationPayload) => {
      console.log(`🔄 [DataStore] Performing mutation:`, payload);
      
      switch (payload.type) {
        case 'updateJob':
          if (!payload.jobId || !payload.data) throw new Error('Job ID and data required');
          return await contentPipelineApi.updateJob(payload.jobId, payload.data);
          
        case 'createFiles':
          if (!payload.data) throw new Error('File data required');
          return await contentPipelineApi.batchCreateFiles(payload.data);
          
        case 'updateFile':
          if (!payload.fileId || !payload.data) throw new Error('File ID and data required');
          return await contentPipelineApi.updateFile(payload.fileId, payload.data);
          
        case 'createAsset':
          if (!payload.jobId || !payload.data) throw new Error('Job ID and asset data required');
          return await contentPipelineApi.createAsset(payload.jobId, payload.data);
          
        case 'updateAsset':
          if (!payload.jobId || !payload.assetId || !payload.data) throw new Error('Job ID, asset ID and data required');
          return await contentPipelineApi.updateAsset(payload.jobId, payload.assetId, payload.data);
          
        case 'deleteAsset':
          if (!payload.jobId || !payload.assetId) throw new Error('Job ID and asset ID required');
          return await contentPipelineApi.deleteAsset(payload.jobId, payload.assetId);
          
        case 'refreshDownloadUrl':
          if (!payload.jobId) throw new Error('Job ID required');
          return await contentPipelineApi.updateDownloadUrl(payload.jobId);
          
        default:
          throw new Error(`Unknown mutation type: ${payload.type}`);
      }
    },
    onSuccess: (data, variables) => {
      console.log(`✅ [DataStore] Mutation successful:`, variables.type);
      
      // Invalidate related queries based on mutation type
      switch (variables.type) {
        case 'updateJob':
          if (variables.jobId) {
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.jobs.detail(variables.jobId) });
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.jobs.all });
          }
          break;
          
        case 'createFiles':
        case 'updateFile':
          queryClient.invalidateQueries({ queryKey: dataStoreKeys.files.all });
          if (variables.jobId) {
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.files.byJob(variables.jobId) });
          }
          break;
          
        case 'createAsset':
        case 'updateAsset':
        case 'deleteAsset':
          if (variables.jobId) {
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.assets.byJob(variables.jobId) });
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.jobs.detail(variables.jobId) });
          }
          break;
          
        case 'refreshDownloadUrl':
          if (variables.jobId) {
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.downloads.byJob(variables.jobId) });
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.jobs.detail(variables.jobId) });
          }
          break;
      }
    },
    onError: (error, variables) => {
      console.error(`❌ [DataStore] Mutation failed:`, variables.type, error);
    },
  });

  // React Query handles auto-refresh via refetchInterval - no manual timers needed

  // React Query handles auto-refresh automatically via refetchInterval

  // Utility functions
  const refresh = useCallback(async () => {
    console.log(`🔄 [DataStore] Manual refresh for ${selector}`);
    await refetch();
  }, [refetch, selector]);

  const mutate = useCallback(async (payload: MutationPayload) => {
    return new Promise((resolve, reject) => {
      performMutation(payload, {
        onSuccess: resolve,
        onError: reject,
      });
    });
  }, [performMutation]);

  const invalidate = useCallback((targetSelector?: DataSelector, targetOptions?: SelectorOptions) => {
    const selectorToInvalidate = targetSelector || selector;
    const optionsToUse = targetOptions || options;
    
    switch (selectorToInvalidate) {
      case 'jobs':
        queryClient.invalidateQueries({ queryKey: dataStoreKeys.jobs.all });
        break;
      case 'jobDetails':
        if (optionsToUse.jobId) {
          queryClient.invalidateQueries({ queryKey: dataStoreKeys.jobs.detail(optionsToUse.jobId) });
        }
        break;
      case 'jobFiles':
        if (optionsToUse.jobId) {
          queryClient.invalidateQueries({ queryKey: dataStoreKeys.files.byJob(optionsToUse.jobId) });
        }
        break;
      case 'jobAssets':
        if (optionsToUse.jobId) {
          queryClient.invalidateQueries({ queryKey: dataStoreKeys.assets.byJob(optionsToUse.jobId) });
        }
        break;
      case 'batchJobs':
        if (optionsToUse.jobIds && optionsToUse.jobIds.length > 0) {
          queryClient.invalidateQueries({ queryKey: dataStoreKeys.jobs.batch(optionsToUse.jobIds) });
        }
        break;
    }
  }, [queryClient, selector, options]);

  const clearCache = useCallback((targetSelector?: DataSelector) => {
    const selectorToClear = targetSelector || selector;
    
    switch (selectorToClear) {
      case 'jobs':
        queryClient.removeQueries({ queryKey: dataStoreKeys.jobs.all });
        break;
      case 'jobDetails':
        if (options.jobId) {
          queryClient.removeQueries({ queryKey: dataStoreKeys.jobs.detail(options.jobId) });
        }
        break;
      case 'jobFiles':
        if (options.jobId) {
          queryClient.removeQueries({ queryKey: dataStoreKeys.files.byJob(options.jobId) });
        }
        break;
      case 'jobAssets':
        if (options.jobId) {
          queryClient.removeQueries({ queryKey: dataStoreKeys.assets.byJob(options.jobId) });
        }
        break;
      case 'batchJobs':
        if (options.jobIds && options.jobIds.length > 0) {
          queryClient.removeQueries({ queryKey: dataStoreKeys.jobs.batch(options.jobIds) });
        }
        break;
    }
  }, [queryClient, selector, options]);

  const preloadData = useCallback(async (targetSelector: DataSelector, targetOptions: SelectorOptions) => {
    console.log(`🔄 [DataStore] Preloading data for ${targetSelector}`);
    
    // This would use the same query logic but with prefetchQuery
    // Implementation depends on specific preloading needs
    return Promise.resolve();
  }, []);

  const forceRefreshJobsList = useCallback(async () => {
    if (DEBUG_CONFIG.ENABLE_AUTO_REFRESH_LOGGING) {
      console.log(`🚀 [DataStore] Force refreshing jobs list for event (new job, rerun, regenerate, etc.)`);
    }
    
    // Invalidate all jobs-related queries
    queryClient.invalidateQueries({ queryKey: dataStoreKeys.jobs.all });
    
    // Optionally invalidate related caches based on configuration
    if (AppDataStoreConfig.FORCE_REFRESH_CONFIG.AUTO_INVALIDATE_RELATED_CACHES) {
      // Invalidate related file and asset queries that might be affected
      queryClient.invalidateQueries({ queryKey: dataStoreKeys.files.all });
      queryClient.invalidateQueries({ queryKey: dataStoreKeys.assets.all });
    }
    
    // Force immediate refetch of current jobs list if this is a jobs selector
    if (selector === 'jobs') {
      await refetch();
    } else {
      // For other selectors, force refetch any jobs list queries in the background
      await queryClient.refetchQueries({ queryKey: dataStoreKeys.jobs.all });
    }
    
    if (DEBUG_CONFIG.ENABLE_AUTO_REFRESH_LOGGING) {
      console.log(`✅ [DataStore] Jobs list force refresh completed`);
    }
  }, [queryClient, selector, refetch]);

  return {
    // Data
    data: data || (selector === 'jobs' ? [] : null) as T,
    
    // State
    isLoading,
    isRefreshing,
    isMutating,
    error: error as Error | null,
    
    // Actions
    refresh,
    mutate,
    invalidate,
    
    // Cache management
    clearCache,
    preloadData,
    
    // Force refresh for specific events
    forceRefreshJobsList,
    
    // Auto-refresh is now handled internally by React Query's refetchInterval
    isAutoRefreshActive: options.autoRefresh && finalConfig.autoRefresh.enabled && isAutoRefreshAllowedOnPage,
  };
}
