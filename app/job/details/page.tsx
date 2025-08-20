'use client';

import { useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
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
  
  // Extract job ID from query parameters
  const jobId = searchParams.get('jobId');
  
  // Skip data fetching if no jobId is provided
  const hasJobId = Boolean(jobId);
  
  // Fetch job data, files, and assets - read-only, no updates needed
  const { 
    data: jobData, 
    isLoading: isLoadingJob, 
    error: jobError,
    refresh: refreshJobData,
    invalidate: invalidateJobData
  } = useAppDataStore('jobDetails', { 
    jobId: jobId || '', 
    autoRefresh: false,
    includeFiles: true,
    includeAssets: true
  });

  // Asset creation loading state for modal
  const [creatingAssets, setCreatingAssets] = useState(false);

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

  if (isLoadingJob) {
    return (
      <JobDetailsLoadingState
        loadingStep={1}
        totalSteps={3}
        loadingMessage="Loading job details..."
        loadingDetail={`Fetching job ${jobId}`}
      />
    );
  }

  if (!hasJobId) {
    return <JobDetailsErrorState error={null} message="No Job ID provided" />;
  }

  if (jobError) {
    return <JobDetailsErrorState error={jobError} />;
  }

  if (!jobData && !isLoadingJob) {
    return <JobDetailsErrorState error={null} message="No Job Data Found" />;
  }

  return (
    <JobDetailsContent
      mergedJobData={jobData}
      jobData={jobData}
      creatingAssets={creatingAssets}
      setCreatingAssets={setCreatingAssets}
      loading={isLoadingJob}
      onAssetsUpdate={handleAssetsUpdate}
    />
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