'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, Suspense, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  JobDetailsLoadingState,
  JobDetailsErrorState,
  JobDetailsContent
} from '../../../components';
import { useAppDataStore, dataStoreKeys } from '../../../hooks/useAppDataStore';

function JobDetailsPageContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const router = useRouter();

  
  // Extract job ID from query parameters
  const jobId = searchParams.get('jobId');
  
  // Skip data fetching if no jobId is provided
  const hasJobId = Boolean(jobId);
  
  // Fetch job data, files, and assets - show cached data immediately, fetch fresh in background
  const { 
    data: jobData, 
    isLoading: isLoadingJob, 
    isRefreshing: isRefreshingJob,
    error: jobError,
    refresh: refreshJobData,
    invalidate: invalidateJobData
  } = useAppDataStore('jobDetails', { 
    jobId: jobId || '', 
    autoRefresh: false,
    includeFiles: true,
    includeAssets: true
  }, {
    // Always show cached data immediately while fetching fresh data
    cache: {
      staleTime: {
        jobs: 0, // Always fetch fresh job data in background
        files: 0, // Always fetch fresh file data
        assets: 0, // Always fetch fresh asset data
        jobsList: 0, // Always fetch fresh jobs list data
      },
      gcTime: {
        jobs: 10 * 60 * 1000, // Keep job data in cache for 10 minutes
        files: 10 * 60 * 1000, // Keep file data in cache for 10 minutes
        assets: 10 * 60 * 1000, // Keep asset data in cache for 10 minutes
        jobsList: 10 * 60 * 1000, // Keep jobs list data in cache for 10 minutes
      }
    }
  });

  // Asset creation loading state for modal
  const [creatingAssets, setCreatingAssets] = useState(false);
  
  // Track when fresh data has been loaded
  const [freshDataLoaded, setFreshDataLoaded] = useState(false);
  const previousJobDataRef = useRef(jobData);

  // Check if we have cached data available to show immediately
  const cacheKey = dataStoreKeys.jobs.detail(jobId || '');
  const cachedJobData = hasJobId ? queryClient.getQueryData(cacheKey) : null;
  const hasAnyCachedData = Boolean(cachedJobData);

  // Track when fresh data arrives to provide visual feedback
  useEffect(() => {
    const previousJobData = previousJobDataRef.current;
    
    // If we now have jobData and we didn't before, fresh data has arrived
    if (!previousJobData && jobData) {
      console.log('✨ [JobDetails] Fresh data loaded from server!', {
        jobStatus: jobData.job_status,
        assetsCount: jobData.assets ? Object.keys(jobData.assets).length : 0,
        filesCount: jobData.content_pipeline_files?.length || 0
      });
      setFreshDataLoaded(true);
      
      // Hide the "fresh data loaded" indicator after 3 seconds
      setTimeout(() => setFreshDataLoaded(false), 3000);
    }
    
    // If jobData changed (e.g., status update), log it
    if (previousJobData && jobData && previousJobData.job_status !== jobData.job_status) {
      console.log('🔄 [JobDetails] Job status updated!', {
        from: previousJobData.job_status,
        to: jobData.job_status
      });
      setFreshDataLoaded(true);
      setTimeout(() => setFreshDataLoaded(false), 2000);
    }
    
    previousJobDataRef.current = jobData;
  }, [jobData]);

  console.log('📊 [JobDetails] Data availability:', {
    hasJobId,
    jobId,
    hasJobData: !!jobData,
    hasCachedData: hasAnyCachedData,
    isLoadingJob,
    isRefreshingJob,
    jobStatus: (jobData || cachedJobData)?.job_status,
    usingCachedData: !jobData && hasAnyCachedData,
    usingFreshData: !!jobData,
    freshDataLoaded
  });

  // Handle asset updates from PSDTemplateSelector (pdf-extract, create, update, delete)
  const handleAssetsUpdate = async (updatedAssets: { job_id: string; assets: any; _cacheTimestamp?: number } | { _forceRefetch: true; job_id: string }) => {
    console.log('🔄 [JobDetails] Handling assets update:', updatedAssets);
    
    if ('_forceRefetch' in updatedAssets && updatedAssets._forceRefetch) {
      // Force refetch from server
      console.log('🔄 [JobDetails] Force refetching job data...');
      await refreshJobData();
    } else if ('assets' in updatedAssets) {
      // Update local cache with new assets using React Query's setQueryData
      console.log('🔄 [JobDetails] Updating React Query cache with new assets...');
      
      const cacheKey = dataStoreKeys.jobs.detail(jobId || '');
      const updatedJobData = {
        ...jobData,
        assets: updatedAssets.assets,
        _lastUpdated: Date.now()
      };
      
      // Update the React Query cache directly
      queryClient.setQueryData(cacheKey, updatedJobData);
      
      // Also trigger cache synchronization for jobs list
      const jobsListKey = dataStoreKeys.jobs.list({});
      const currentJobsList = queryClient.getQueryData(jobsListKey) as any[];
      if (currentJobsList && Array.isArray(currentJobsList)) {
        const updatedJobsList = currentJobsList.map((job: any) => {
          if (job.job_id === updatedAssets.job_id) {
            return { ...job, assets: updatedAssets.assets };
          }
          return job;
        });
        queryClient.setQueryData(jobsListKey, updatedJobsList);
      }
      
      console.log('✅ [JobDetails] Cache updated successfully');
    }
  };



  // Only show loading state if we have no cached data AND we're loading for the first time
  if (isLoadingJob && !hasAnyCachedData) {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 30%, #2d2d2d 70%, #000000 100%)',
        padding: '2rem 1rem'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <JobDetailsLoadingState
            loadingStep={1}
            totalSteps={3}
            loadingMessage="Loading job details..."
            loadingDetail={`Fetching job ${jobId}`}
          />
        </div>
      </div>
    );
  }

  if (!hasJobId) {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 30%, #2d2d2d 70%, #000000 100%)',
        padding: '2rem 1rem'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <JobDetailsErrorState error={null} message="No Job ID provided" />
        </div>
      </div>
    );
  }

  if (jobError && !hasAnyCachedData) {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 30%, #2d2d2d 70%, #000000 100%)',
        padding: '2rem 1rem'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <JobDetailsErrorState error={jobError} />
        </div>
      </div>
    );
  }

  // If we have neither fresh data nor cached data, show error
  if (!jobData && !cachedJobData && !isLoadingJob) {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 30%, #2d2d2d 70%, #000000 100%)',
        padding: '2rem 1rem'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <JobDetailsErrorState error={null} message="No Job Data Found" />
        </div>
      </div>
    );
  }

  // Use fresh data if available, otherwise fall back to cached data
  const displayJobData = jobData || cachedJobData;
  const isActuallyLoading = isLoadingJob && !hasAnyCachedData;
  
  console.log('🎯 [JobDetails] Rendering with data:', {
    usingFreshData: !!jobData,
    usingCachedData: !jobData && !!cachedJobData,
    dataSource: jobData ? 'fresh' : cachedJobData ? 'cached' : 'none',
    isRefreshing: isRefreshingJob,
    freshDataLoaded,
    jobStatus: displayJobData?.job_status,
    assetsCount: displayJobData?.assets ? Object.keys(displayJobData.assets).length : 0
  });

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 30%, #2d2d2d 70%, #000000 100%)',
      padding: '2rem 1rem'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <JobDetailsContent
          mergedJobData={displayJobData}
          jobData={displayJobData}
          creatingAssets={creatingAssets}
          setCreatingAssets={setCreatingAssets}
          loading={isActuallyLoading}
          isRefreshing={isRefreshingJob}
          freshDataLoaded={freshDataLoaded}
          onAssetsUpdate={handleAssetsUpdate}
        />
      </div>
    </div>
  );
}

export default function JobDetailsPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#e0e0e0'
      }}>
        Loading job details...
      </div>
    }>
      <JobDetailsPageContent />
    </Suspense>
  );
} 