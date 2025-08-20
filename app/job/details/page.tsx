'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { 
  JobDetailsLoadingState,
  JobDetailsErrorState,
  JobDetailsContent
} from '../../../components';
import { useAppDataStore } from '../../../hooks/useAppDataStore';



function JobDetailsPageContent() {
  const searchParams = useSearchParams();
  
  // Extract job ID from query parameters
  const jobId = searchParams.get('jobId');
  
  // Skip data fetching if no jobId is provided
  const hasJobId = Boolean(jobId);
  
  // Fetch job data, files, and assets - only once on load
  const { 
    data: jobData, 
    isLoading: isLoadingJob, 
    error: jobError,
    refresh: refetchJobData,
    mutate: updateJobData
  } = useAppDataStore('jobDetails', { 
    jobId: jobId || '', 
    autoRefresh: false,
    includeFiles: true,
    includeAssets: true
  });

  // Clean data extraction
  const fileData = jobData?.content_pipeline_files || [];
  const jobAssets = jobData?.assets || {};
  const error = jobError;
  
  // Simple loading state
  const isLoading = isLoadingJob;

  // Asset creation loading state for modal
  const [creatingAssets, setCreatingAssets] = useState(false);

  // Simplified job data update handler for details page (assets + download URL only)
  const handleJobDataUpdate = (updatedJobData: any) => {
    if (!updatedJobData) {
      console.warn('⚠️ handleJobDataUpdate called with no data');
      return;
    }

    // Force refetch if explicitly requested
    if (updatedJobData._forceRefetch) {
      console.log('🔄 Force refetch requested, fetching latest data from server');
      refetchJobData();
      return;
    }

    // Refetch for download URL changes (needed for download section)
    if (updatedJobData.download_url) {
      console.log('🔄 Download URL updated, refetching job data');
      refetchJobData();
      return;
    }

    // For asset-only operations, components handle response data locally (no refetch needed)
    console.log('✅ Asset update - components using response data directly');
  };





  if (isLoading) {
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

  if (error) {
    return <JobDetailsErrorState error={error} />;
  }

  if (!jobData && !isLoading) {
    return <JobDetailsErrorState error={null} message="No Job Data Found" />;
  }

  return (
    <JobDetailsContent
      mergedJobData={jobData}
      jobData={jobData}
      creatingAssets={creatingAssets}
      setCreatingAssets={setCreatingAssets}
      loading={isLoading}
      onJobDataUpdate={handleJobDataUpdate}
      refetchJobData={refetchJobData}
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