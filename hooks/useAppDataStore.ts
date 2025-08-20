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
            console.log(`📁 [DataStore] Fetching ${mappedData.api_files.length} existing files for job ${options.jobId}`);
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
        } else if (options.includeFiles) {
          console.log(`📁 [DataStore] No api_files found for job ${options.jobId}, skipping batch_get_files call`);
          mappedData.content_pipeline_files = []; // Ensure it's always an array
        }
        
        if (options.includeAssets) {
          // Only fetch assets if job status indicates they should exist
          const shouldFetchAssets = mappedData.job_status && 
            ['extracted', 'generating', 'generating-failed', 'completed'].includes(mappedData.job_status);
            
          if (shouldFetchAssets) {
            try {
              const assetsResponse = await contentPipelineApi.getAssets(options.jobId);
              
              // Handle "No assets found" as a successful case (not an error)
              if (assetsResponse.error && assetsResponse.error.includes('No assets found')) {
                console.log(`ℹ️ [DataStore] No assets found for job ${options.jobId} - setting empty assets object`);
                mappedData.assets = {};
              } else {
                mappedData.assets = assetsResponse.assets;
                console.log(`✅ [DataStore] Fetched ${Object.keys(assetsResponse.assets).length} assets for job ${options.jobId} (status: ${mappedData.job_status})`);
              }
            } catch (error) {
              console.warn(`⚠️ [DataStore] Failed to fetch assets for job ${options.jobId}:`, error);
              mappedData.assets = {}; // Set empty assets object on error
            }
          } else {
            console.log(`ℹ️ [DataStore] Skipping assets fetch for job ${options.jobId} - status '${mappedData.job_status}' not ready for assets`);
            mappedData.assets = {}; // Set empty assets object
          }
        }
        
        console.log(`✅ [DataStore] Fetched job details for ${options.jobId}`);
        return mappedData as T;
      }
      
      case 'jobFiles': {
        if (!options.jobId) throw new Error('Job ID is required for jobFiles selector');
        
        // First try to get job data from cache to avoid redundant get_job call
        const cachedJobData = queryClient.getQueryData(dataStoreKeys.jobs.detail(options.jobId));
        let apiFiles: string[] = [];
        
        if (cachedJobData && (cachedJobData as any).files) {
          console.log(`🎯 [DataStore] Using cached job data for files list (job ${options.jobId})`);
          apiFiles = (cachedJobData as any).files || [];
        } else {
          console.log(`📞 [DataStore] No cached job data found, fetching job to get files list (job ${options.jobId})`);
          // Fallback: get the job to find the file list
          const jobResponse = await contentPipelineApi.getJob(options.jobId);
          apiFiles = jobResponse.job.files || [];
        }
        
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
        
        // Note: Assets should only be fetched when job status is 'extracted' or later
        // Caller should check job status before calling this selector
        console.log(`🔄 [DataStore] Fetching assets for job ${options.jobId} (ensure job status is 'extracted' or later)`);
        
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

  // Cache synchronization: Update individual job details when jobs list changes
  const syncJobCaches = useCallback((freshJobsData: any[]) => {
    if (!Array.isArray(freshJobsData)) return;
    
    console.log(`🔄 [DataStore] Syncing ${freshJobsData.length} jobs with individual job caches`);
    
    freshJobsData.forEach((freshJob: any) => {
      if (!freshJob.job_id) return;
      
      // Check if we have cached individual job details for this job
      const cachedJobDetails = queryClient.getQueryData(dataStoreKeys.jobs.detail(freshJob.job_id));
      
      if (cachedJobDetails) {
        const cachedJob = cachedJobDetails as any;
        
        // Check if the job status has changed
        if (cachedJob.job_status !== freshJob.job_status) {
          console.log(`🔄 [DataStore] Syncing job ${freshJob.job_id} status: ${cachedJob.job_status} → ${freshJob.job_status}`);
          
          // Update the cached job details with the fresh status and any other updated fields
          const updatedJobDetails = {
            ...cachedJob,
            job_status: freshJob.job_status,
            last_updated: freshJob.last_updated || new Date().toISOString(),
            // Sync other fields that might have changed
            source_folder: freshJob.source_folder,
            description: freshJob.description,
            created_at: freshJob.created_at,
            download_url: freshJob.download_url,
            download_url_expires: freshJob.download_url_expires,
            download_url_created: freshJob.download_url_created,
          };
          
          // Update the individual job details cache
          queryClient.setQueryData(
            dataStoreKeys.jobs.detail(freshJob.job_id),
            updatedJobDetails
          );
          
          console.log(`✅ [DataStore] Job ${freshJob.job_id} details cache synchronized with jobs list`);
        }
      }
    });
  }, [queryClient]);

  // Reverse sync: Update jobs list when individual job details change
  const syncJobsListCache = useCallback((freshJobDetails: any) => {
    if (!freshJobDetails?.job_id) return;
    
    // Find and update all jobs list caches that might contain this job
    const allJobsListQueries = queryClient.getQueriesData({ queryKey: dataStoreKeys.jobs.all });
    
    allJobsListQueries.forEach(([queryKey, cachedData]) => {
      if (Array.isArray(cachedData)) {
        const jobIndex = cachedData.findIndex((job: any) => job.job_id === freshJobDetails.job_id);
        
        if (jobIndex !== -1) {
          const currentJob = cachedData[jobIndex];
          
          // Check if status or other important fields have changed
          if (currentJob.job_status !== freshJobDetails.job_status || 
              currentJob.last_updated !== freshJobDetails.last_updated) {
            
            console.log(`🔄 [DataStore] Syncing jobs list cache with updated job ${freshJobDetails.job_id} (${currentJob.job_status} → ${freshJobDetails.job_status})`);
            
            // Create updated job for jobs list (only sync essential fields)
            const updatedJobForList = {
              ...currentJob,
              job_status: freshJobDetails.job_status,
              last_updated: freshJobDetails.last_updated,
              source_folder: freshJobDetails.source_folder || currentJob.source_folder,
              description: freshJobDetails.description || currentJob.description,
              download_url: freshJobDetails.download_url,
              download_url_expires: freshJobDetails.download_url_expires,
              download_url_created: freshJobDetails.download_url_created,
            };
            
            // Update the jobs list cache
            const updatedJobsList = [...cachedData];
            updatedJobsList[jobIndex] = updatedJobForList;
            
            queryClient.setQueryData(queryKey, updatedJobsList);
            
            console.log(`✅ [DataStore] Jobs list cache synchronized with job ${freshJobDetails.job_id} details`);
          }
        }
      }
    });
  }, [queryClient]);

  // Main React Query hook
  const {
    data,
    isLoading,
    isFetching: isRefreshing,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      console.log(`🌐 [DataStore] Making API call for ${selector}:`, {
        jobId: options.jobId,
        includeFiles: options.includeFiles,
        includeAssets: options.includeAssets,
        staleTime: cacheSettings.staleTime,
        isBackgroundFetch: cacheSettings.staleTime === 0
      });
      
      const result = await queryFn();
      
      console.log(`✅ [DataStore] API call completed for ${selector}:`, {
        resultType: Array.isArray(result) ? 'array' : typeof result,
        resultSize: Array.isArray(result) ? result.length : 'single',
        hasAssets: (result as any)?.assets ? Object.keys((result as any).assets).length : 0,
        jobStatus: (result as any)?.job_status
      });
      
      // Auto-sync caches when jobs list is fetched
      if (selector === 'jobs' && Array.isArray(result)) {
        syncJobCaches(result);
      }
      
      // Auto-sync jobs list cache when individual job details are fetched
      if (selector === 'jobDetails' && result && typeof result === 'object') {
        syncJobsListCache(result);
      }
      
      return result;
    },
    enabled: queryKey.length > 0,
    staleTime: cacheSettings.staleTime,
    gcTime: cacheSettings.gcTime,
    refetchOnMount: (() => {
      // Always refetch for jobs list
      if (selector === 'jobs') return true;
      
      // For jobDetails, refetch if staleTime is 0 (indicating we want always-fresh data)
      if (selector === 'jobDetails' && cacheSettings.staleTime === 0) {
        console.log(`🔄 [DataStore] Background fetch enabled for ${selector} with staleTime: 0`);
        return true;
      }
      
      // For other selectors, use cached data without refetching
      return false;
    })(), // Show cached data immediately, then fetch fresh data in background when configured
    refetchOnWindowFocus: false, // Disable refetching on window focus to reduce unnecessary API calls
    retry: (failureCount, error) => {
      // Don't retry if we know assets don't exist (reduces 404 spam)
      if (selector === 'jobDetails' && options.includeAssets) {
        const errorMessage = error?.message || '';
        if (errorMessage.includes('No assets found') || errorMessage.includes('404')) {
          console.log(`ℹ️ [DataStore] Not retrying asset fetch for job ${options.jobId} - no assets available`);
          return false;
        }
      }
      // Default retry logic: 3 retries with exponential backoff
      return failureCount < 3;
    },
    // This combination ensures: cached data shown instantly + fresh data fetched in background
    // Use React Query's built-in polling instead of manual timers
    refetchInterval: (query) => {
      const data = query.state.data;
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
        // Check if auto-refresh is explicitly disabled for this job request
        if (!options.autoRefresh) {
          if (DEBUG_CONFIG.ENABLE_AUTO_REFRESH_LOGGING) {
            console.log(`⏸️ [DataStore] Auto-refresh disabled for job ${options.jobId} - cached data + single background fetch only`);
          }
          return false; // No polling, just initial fetch + cache
        }
        
        const job = data as any; // Type will be validated at runtime
        const jobStatus = job?.job_status || '';
        
        // Check if this job status should never poll (e.g., 'completed')
        const shouldNeverPoll = ConfigHelpers.shouldJobNeverPoll(jobStatus);
        if (shouldNeverPoll) {
          console.log(`⏹️ [DataStore] Stopping polling - job ${options.jobId} is ${jobStatus} (completed/terminal status)`);
          return false; // Stop polling completely
        }
        
        // If we're including assets and we've confirmed there are no assets, reduce polling frequency
        if (options.includeAssets && job?.assets && typeof job.assets === 'object' && Object.keys(job.assets).length === 0) {
          // Job has no assets - poll less frequently to avoid spam
          const reducedInterval = finalConfig.autoRefresh.intervals.activeJobs * 3; // 3x longer interval (15 seconds)
          console.log(`🔄 [DataStore] Job ${options.jobId} has no assets - reducing polling to ${reducedInterval}ms to avoid 404 spam`);
          return reducedInterval;
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
    retryDelay: (attemptIndex) => 
      Math.min(1000 * Math.pow(finalConfig.retry.backoffMultiplier, attemptIndex), 30000),
  });

  // Mutation hook for data modifications
  const { mutate: performMutation, isPending: isMutating } = useMutation({
    mutationFn: async (payload: MutationPayload) => {
      console.log(`🔄 [DataStore] Performing mutation:`, payload);
      
      switch (payload.type) {
        case 'createJob':
          if (!payload.data) throw new Error('Job data required');
          return await contentPipelineApi.createJob(payload.data);
          
        case 'rerunJob':
          if (!payload.jobId || !payload.data) throw new Error('Job ID and data required for rerun');
          return await contentPipelineApi.rerunJob(payload.jobId, payload.data);
          
        case 'updateJob':
          if (!payload.jobId || !payload.data) throw new Error('Job ID and data required');
          return await contentPipelineApi.updateJob(payload.jobId, payload.data);
          
        case 'createFiles':
          if (!payload.data) throw new Error('File data required');
          return await contentPipelineApi.batchCreateFiles(payload.data);
          
        case 'batchGetFiles':
          if (!payload.data) throw new Error('File names required');
          return await contentPipelineApi.batchGetFiles(payload.data);
          
        case 'updateFile':
          if (!payload.fileId || !payload.data) throw new Error('File ID and data required');
          return await contentPipelineApi.updateFile(payload.fileId, payload.data);
          
        case 'updatePdfFileStatus':
          if (!payload.fileId || !payload.data?.pdfFilename || !payload.data?.status) {
            throw new Error('File ID, PDF filename, and status required');
          }
          return await contentPipelineApi.updatePdfFileStatus(
            payload.fileId, 
            payload.data.pdfFilename, 
            payload.data.status
          );
          
        case 'batchUpdatePdfFileStatus':
          if (!payload.fileId || !payload.data?.pdfUpdates) {
            throw new Error('File ID and PDF updates required');
          }
          return await contentPipelineApi.batchUpdatePdfFileStatus(
            payload.fileId, 
            payload.data.pdfUpdates
          );
          
        case 'createAsset':
          if (!payload.jobId || !payload.data) throw new Error('Job ID and asset data required');
          return await contentPipelineApi.createAsset(payload.jobId, payload.data);
          
        case 'updateAsset':
          if (!payload.jobId || !payload.assetId || !payload.data) throw new Error('Job ID, asset ID and data required');
          return await contentPipelineApi.updateAsset(payload.jobId, payload.assetId, payload.data);
          
        case 'deleteAsset':
          if (!payload.jobId || !payload.assetId) throw new Error('Job ID and asset ID required');
          return await contentPipelineApi.deleteAsset(payload.jobId, payload.assetId);
          
        case 'bulkUpdateAssets':
          if (!payload.jobId || !payload.data) throw new Error('Job ID and assets data required');
          return await contentPipelineApi.bulkUpdateAssets(payload.jobId, payload.data);
          
        case 'generateAssets':
          if (!payload.jobId || !payload.data) throw new Error('Job ID and assets data required');
          return await contentPipelineApi.generateAssets(payload.jobId, payload.data);
          
        case 'regenerateAssets':
          if (!payload.jobId) throw new Error('Job ID required');
          return await contentPipelineApi.regenerateAssets(payload.jobId);
          
        case 'extractPdfData':
          if (!payload.data) throw new Error('PDF data required');
          return await contentPipelineApi.extractPdfData(payload.data);
          
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
        case 'createJob':
        case 'rerunJob':
          // Invalidate all jobs lists to show the new/rerun job
          queryClient.invalidateQueries({ queryKey: dataStoreKeys.jobs.all });
          break;
          
        case 'updateJob':
          if (variables.jobId) {
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.jobs.detail(variables.jobId) });
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.jobs.all });
          }
          break;
          
        case 'createFiles':
        case 'batchGetFiles':
        case 'updateFile':
          queryClient.invalidateQueries({ queryKey: dataStoreKeys.files.all });
          if (variables.jobId) {
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.files.byJob(variables.jobId) });
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.jobs.detail(variables.jobId) });
          }
          break;
          
                    case 'updatePdfFileStatus':
            case 'batchUpdatePdfFileStatus':
              // These mutations return updated file data - update cache directly instead of invalidating
              const jobIdForFileUpdate = variables.jobId || options.jobId; // Use jobId from payload or hook options
              
              if (jobIdForFileUpdate && data?.file) {
                console.log(`✅ [DataStore] Updating cache with ${variables.type} response for job ${jobIdForFileUpdate}`, {
                  responseFileData: {
                    filename: data.file.filename,
                    originalFilesCount: Object.keys(data.file.original_files || {}).length,
                    originalFileStatuses: Object.entries(data.file.original_files || {}).map(([name, info]: [string, any]) => `${name}:${info.status}`)
                  }
                });
                
                // Update the files cache with the updated file data
                queryClient.setQueryData(
                  dataStoreKeys.files.byJob(jobIdForFileUpdate),
                  (prevFiles: any[]) => {
                    console.log(`🔄 [DataStore] Updating files cache for job ${jobIdForFileUpdate}:`, {
                      prevFilesCount: Array.isArray(prevFiles) ? prevFiles.length : 'not array',
                      targetFilename: data.file.filename
                    });
                    
                    if (!Array.isArray(prevFiles)) return prevFiles;
                    
                    const updatedFiles = prevFiles.map(file => 
                      file.filename === data.file.filename ? data.file : file
                    );
                    
                    console.log(`✅ [DataStore] Files cache updated for job ${jobIdForFileUpdate}`);
                    return updatedFiles;
                  }
                );
                
                // Update the job details cache to include the updated file
                queryClient.setQueryData(
                  dataStoreKeys.jobs.detail(jobIdForFileUpdate),
                  (prevJob: any) => {
                    console.log(`🔄 [DataStore] Updating job details cache for job ${jobIdForFileUpdate}:`, {
                      hasPrevJob: !!prevJob,
                      prevJobFilesCount: prevJob?.content_pipeline_files?.length || 0,
                      targetFilename: data.file.filename
                    });
                    
                    if (!prevJob?.content_pipeline_files) return prevJob;
                    
                    const updatedJob = {
                      ...prevJob,
                      content_pipeline_files: prevJob.content_pipeline_files.map((file: any) => 
                        file.filename === data.file.filename ? data.file : file
                      )
                    };
                    
                    console.log(`✅ [DataStore] Job details cache updated for job ${jobIdForFileUpdate}`);
                    return updatedJob;
                  }
                );
              } else {
                // Fallback to invalidation if no response data
                console.log(`⚠️ [DataStore] No file data in ${variables.type} response or no jobId available, falling back to invalidation`);
                queryClient.invalidateQueries({ queryKey: dataStoreKeys.files.all });
                if (jobIdForFileUpdate) {
                  queryClient.invalidateQueries({ queryKey: dataStoreKeys.files.byJob(jobIdForFileUpdate) });
                  queryClient.invalidateQueries({ queryKey: dataStoreKeys.jobs.detail(jobIdForFileUpdate) });
                }
              }
              break;
          
        case 'createAsset':
        case 'updateAsset':
        case 'deleteAsset':
        case 'bulkUpdateAssets':
          // For asset operations, use response data to update cache instead of invalidating
          // Handle nested assets structure: response.assets.assets
          const assetsData = data?.assets?.assets || data?.assets;
          if (variables.jobId && assetsData && typeof assetsData === 'object') {
            console.log(`✅ [DataStore] Updating asset cache with response data instead of invalidating`, {
              assetCount: Object.keys(assetsData).length,
              isEmpty: Object.keys(assetsData).length === 0,
              hasNestedStructure: !!data?.assets?.assets
            });
            
            // Update assets cache with response data (handle empty object for deleted assets)
            queryClient.setQueryData(
              dataStoreKeys.assets.byJob(variables.jobId),
              assetsData
            );
            
            // Update job details cache assets field with response data
            queryClient.setQueryData(
              dataStoreKeys.jobs.detail(variables.jobId),
              (prevJob: any) => {
                if (!prevJob) return prevJob;
                return {
                  ...prevJob,
                  assets: assetsData
                };
              }
            );
            
            console.log(`✅ [DataStore] Asset caches updated with response data - no additional API calls needed`);
            console.log(`🚫 [DataStore] Skipping job details invalidation - using response data instead`);
          } else if (variables.jobId) {
            // Fallback to invalidation only if no response data available
            console.log(`⚠️ [DataStore] No assets in response data, falling back to assets cache invalidation only`);
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.assets.byJob(variables.jobId) });
            // Don't invalidate job details cache to avoid triggering get_job + batch_get_files + list_assets
          }
          break;
          
        case 'generateAssets':
        case 'regenerateAssets':
          // These operations typically change job status, so invalidate to get fresh data
          if (variables.jobId) {
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.assets.byJob(variables.jobId) });
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.jobs.detail(variables.jobId) });
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.jobs.all });
          }
          break;
          
        case 'extractPdfData':
          // PDF extraction might affect files and job status
          if (variables.jobId) {
            queryClient.invalidateQueries({ queryKey: dataStoreKeys.files.byJob(variables.jobId) });
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
