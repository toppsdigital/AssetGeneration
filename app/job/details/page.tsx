'use client';

import { useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
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
  
  // Fetch job data, files, and assets - read-only, no updates needed
  const { 
    data: jobData, 
    isLoading: isLoadingJob, 
    error: jobError
  } = useAppDataStore('jobDetails', { 
    jobId: jobId || '', 
    autoRefresh: false,
    includeFiles: true,
    includeAssets: true
  });

  // Asset creation loading state for modal
  const [creatingAssets, setCreatingAssets] = useState(false);

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