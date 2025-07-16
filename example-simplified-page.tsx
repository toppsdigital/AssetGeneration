'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  NavBar, 
  JobHeader, 
  PSDTemplateSelector, 
  FilesSection, 
  JobHeaderSkeleton, 
  Spinner 
} from '../components';
import { useJobData, useFileUpload } from '../hooks';
import styles from '../styles/Edit.module.css';

function JobDetailsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Extract query parameters
  const jobId = searchParams.get('jobId');
  const createFiles = searchParams.get('createFiles');
  
  // Custom hooks handle all the complex logic
  const { 
    data: jobData, 
    isLoading, 
    error 
  } = useJobData(jobId);
  
  const uploadState = useFileUpload();

  // Simple loading and error states
  if (isLoading) {
    return (
      <div className={styles.pageContainer}>
        <NavBar 
          showHome
          showBackToEdit
          onHome={() => router.push('/')}
          onBackToEdit={() => router.push('/jobs')}
          backLabel="Back to Jobs"
          title="Loading Job Details..."
        />
        <div className={styles.editContainer}>
          <main className={styles.mainContent}>
            <div className="container">
              <JobHeaderSkeleton />
              <div>Loading...</div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (error || !jobData) {
    return (
      <div className={styles.pageContainer}>
        <NavBar 
          showHome
          showBackToEdit
          onHome={() => router.push('/')}
          onBackToEdit={() => router.push('/jobs')}
          backLabel="Back to Jobs"
          title="Job Details"
        />
        <div className={styles.loading}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <h2>Error Loading Job Details</h2>
          <p>{error?.message || 'Job not found'}</p>
        </div>
      </div>
    );
  }

  const getJobTitle = () => {
    const parts = [
      jobData.app_name,
      jobData.release_name,
      jobData.subset_name
    ].filter(Boolean);
    return parts.join(' - ') || 'Unknown Job';
  };

  return (
    <div className={styles.pageContainer}>
      <NavBar
        showHome
        showBackToEdit
        onHome={() => router.push('/')}
        onBackToEdit={() => router.push('/jobs')}
        backLabel="Back to Jobs"
        title={getJobTitle()}
      />
      
      <div className={styles.editContainer}>
        <main className={styles.mainContent}>
          <div className="container">
            
            {/* Job Header - Clean and simple */}
            <JobHeader 
              jobData={jobData}
              totalPdfFiles={uploadState.totalPdfFiles}
              uploadedPdfFiles={uploadState.uploadedPdfFiles}
            />

            {/* PSD Configuration - Only when needed */}
            <PSDTemplateSelector
              jobData={jobData}
              mergedJobData={jobData}
              isVisible={jobData.job_status?.toLowerCase() === 'extracted'}
            />

            {/* Files Section - All complexity hidden */}
            <FilesSection
              mergedJobData={jobData}
              jobData={jobData}
              uploadingFiles={uploadState.uploadingFiles}
              loadingFiles={isLoading}
              filesLoaded={!!jobData.content_pipeline_files?.length}
              loadingStep={1}
              loadingMessage="Loading files..."
            />

          </div>
        </main>
      </div>
    </div>
  );
}

export default function JobDetailsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <JobDetailsPageContent />
    </Suspense>
  );
} 