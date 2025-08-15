import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useJobData, useJobFiles, UIJobData, jobKeys, syncJobDataAcrossCaches } from '../web/hooks/useJobData';

interface UseJobDetailsDataProps {
  startUpload?: string | null;
  createFiles?: string | null;
}

export const useJobDetailsData = ({ startUpload, createFiles }: UseJobDetailsDataProps) => {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const jobId = searchParams.get('jobId');
  
  // Local state to force UI updates when cache doesn't trigger re-render
  const [localJobData, setLocalJobData] = useState(null);
  
  // Always fetch fresh job data when opening details page
  useEffect(() => {
    if (jobId) {
      const cachedJobData = queryClient.getQueryData<UIJobData>(jobKeys.detail(jobId));
      const isFromFreshJobCreation = startUpload === 'true' && createFiles === 'true';
      
      // Detect navigation source from referrer or session storage
      const referrer = document.referrer;
      const isFromJobsList = referrer.includes('/jobs') && !referrer.includes('/job/preview');
      const isFromPreview = referrer.includes('/job/preview');
      const sessionNavigationSource = sessionStorage.getItem('navigationSource');
      
      console.log('📋 Job details page cache strategy:', {
        jobId,
        hasCache: !!cachedJobData,
        status: cachedJobData?.job_status,
        isFromFreshJobCreation,
        isFromJobsList,
        isFromPreview,
        referrer,
        sessionNavigationSource,
        startUpload,
        createFiles
      });
      
      // ALWAYS force fresh fetch to ensure we have the latest job data
      const shouldForceFreshFetch = true;
      const cacheStrategy = 'Always force fresh fetch to get latest job status and progress data';
      
      console.log('📋 Cache decision:', { shouldForceFreshFetch, cacheStrategy });
      
      if (shouldForceFreshFetch) {
        console.log('🔄 Forcing cache invalidation for fresh job data:', cacheStrategy);
        queryClient.removeQueries({ queryKey: jobKeys.detail(jobId) });
        queryClient.removeQueries({ queryKey: jobKeys.files(jobId) });
      }
      
      // Clear navigation source after using it
      sessionStorage.removeItem('navigationSource');
    }
  }, [jobId, queryClient, startUpload, createFiles]);
  
  // React Query hooks for job data
  const { 
    data: jobData, 
    isLoading: isLoadingJob, 
    error: jobError,
    isFetching: isRefetchingJob,
    refetch: refetchJobData
  } = useJobData(jobId || null);

  // Use local data if available, otherwise use React Query data
  const effectiveJobData = localJobData || jobData;
  
  // File data fetching with caching - only when NOT creating files
  const shouldFetchFiles = createFiles !== 'true';
  
  const { 
    data: fileData = [], 
    isLoading: isLoadingFiles,
    error: filesError,
    refetch: refetchFileData 
  } = useJobFiles(
    shouldFetchFiles ? (jobData?.job_id || null) : null, 
    shouldFetchFiles ? (jobData?.api_files || []) : [],
    shouldFetchFiles
  );
  
  // Merge cached job data with fresh file data
  const mergedJobData = effectiveJobData ? {
    ...effectiveJobData,
    // When createFiles='true', use files from jobData (set by createNewFiles)
    // When createFiles!='true', use fresh fileData from useJobFiles hook
    content_pipeline_files: createFiles === 'true' ? (effectiveJobData.content_pipeline_files || []) : fileData,
    // Ensure assets is always defined, even if empty
    assets: effectiveJobData.assets || {}
  } : null;

  // Enhanced loading state management
  const isLoading = isLoadingJob && !jobData;
  const isLoadingData = isLoadingJob || isLoadingFiles;
  const error = jobError || filesError;

  // Create a proper data updater that updates React Query cache with synchronization
  const updateJobDataForUpload = useCallback((updater: (prev: any) => any) => {
    // Update both React Query caches using synchronization utility
    if (jobData?.job_id) {
      syncJobDataAcrossCaches(queryClient, jobData.job_id, updater);
      
      // Skip refetch during uploads - local updates are sufficient
      console.log('✅ Updated job data locally (skipping refetch during uploads)');
    }
    
    // CRITICAL: Update the local state that the UI actually uses
    setLocalJobData(prev => {
      const baseData = prev || jobData;
      return baseData ? updater(baseData) : null;
    });
  }, [jobData?.job_id, queryClient, jobData]);

  // Debug logging for cache behavior
  useEffect(() => {
    console.log('🔍 React Query State:', {
      jobId,
      hasJobData: !!jobData,
      isLoading: isLoadingJob,
      isFetching: isRefetchingJob,
      hasError: !!jobError,
      jobStatus: jobData?.job_status,
      source: jobData ? 'Cache/Fresh Data' : 'None',
      timestamp: new Date().toISOString()
    });
  }, [jobId, jobData, isLoadingJob, isRefetchingJob, jobError]);

  return {
    // Data
    jobData,
    effectiveJobData,
    mergedJobData,
    fileData,
    localJobData,
    
    // Loading states
    isLoading,
    isLoadingJob,
    isLoadingFiles,
    isLoadingData,
    isRefetchingJob,
    
    // Errors
    error,
    jobError,
    filesError,
    
    // Functions
    refetchJobData,
    refetchFileData,
    updateJobDataForUpload,
    setLocalJobData,
    
    // Computed values
    shouldFetchFiles,
    jobId
  };
};
