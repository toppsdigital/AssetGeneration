'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';
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

  // Optimized job data update handler - uses response data when possible
  const handleJobDataUpdate = (updatedJobData: any) => {
    if (!updatedJobData) {
      console.warn('⚠️ handleJobDataUpdate called with no data');
      return;
    }

    // Only refetch in specific cases where it's actually needed
    if (updatedJobData._forceRefetch) {
      console.log('🔄 Force refetch requested, fetching latest data from server');
      refetchJobData();
      return;
    }

    // Handle specific update types that require job data refresh
    if (updatedJobData.download_url || updatedJobData.job_status || updatedJobData.assets) {
      console.log('✅ Received updated job data with meaningful changes:', {
        hasDownloadUrl: !!updatedJobData.download_url,
        hasJobStatus: !!updatedJobData.job_status,
        hasAssets: !!updatedJobData.assets,
        hasFiles: !!updatedJobData.content_pipeline_files
      });
      
      // For operations that provide significant job data updates (download URLs, job status, etc.),
      // we need to refetch to ensure the UI is fully synchronized
      // This is more targeted than the previous "always refetch" approach
      console.log('🔄 Refetching job data to sync UI with server response');
      refetchJobData();
      return;
    }

    // For asset-only operations or minor updates, components can handle locally
    console.log('💡 Minor update detected - components can handle response data locally');
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
      uploadEngine={{
        uploadStarted: false,
        allFilesUploaded: true,
        totalPdfFiles: 0,
        uploadedPdfFiles: 0,
        uploadingFiles: new Set()
      }}
      uploadsInProgress={false}
      creatingAssets={false}
      setCreatingAssets={() => {}}
      loadingFiles={false}
      filesLoaded={fileData.length > 0}
      loadingStep={1}
      loadingMessage="Ready"
      loadingDetail=""
      loading={isLoading}
      onJobDataUpdate={handleJobDataUpdate}
      updateJobDataForUpload={() => {
        console.log('🔄 updateJobDataForUpload called - refetching job data');
        refetchJobData();
      }}
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