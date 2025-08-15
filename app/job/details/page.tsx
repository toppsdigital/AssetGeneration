'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import { 
  JobHeader, 
  PSDTemplateSelector, 
  DownloadSection,
  FilesSection, 
  JobHeaderSkeleton, 
  LoadingProgress,
  FileCardSkeleton,
  FileCard,
  JobDetailsLoadingState,
  JobDetailsErrorState,
  JobDetailsContent
} from '../../../components';
import { 
  useUploadEngine, 
  usePSDTemplateManager, 
  useLoadingStateManager 
} from '../../../hooks';
import styles from '../../../styles/Edit.module.css';
import Spinner from '../../../components/Spinner';
import { JobData, FileData } from '../../../web/utils/contentPipelineApi';
import { useAppDataStore } from '../../../hooks/useAppDataStore';
import { getTotalLoadingSteps, getJobTitle } from '../../../utils/fileOperations';

// Add CSS animation for spinner
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

// UIJobData interface is now imported from useJobData hook

// Skeleton components are now imported from components/

function JobDetailsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Extract query parameters using useSearchParams  
  const startUpload = searchParams.get('startUpload');
  const createFiles = searchParams.get('createFiles');
  const jobId = searchParams.get('jobId');
  
  // Skip data fetching if no jobId is provided
  const hasJobId = Boolean(jobId);
  
  // Use centralized data store for all data fetching (cached first, no auto-refresh)
  const { 
    data: jobData, 
    isLoading: isLoadingJob, 
    error: jobError,
    refresh: refetchJobData,
    mutate: mutateJob
  } = useAppDataStore('jobDetails', { 
    jobId: jobId || '', 
    autoRefresh: false,
    includeFiles: true,
    includeAssets: true
  });
  
  const { 
    data: jobAssets, 
    isLoading: isLoadingAssets,
    mutate: mutateAssets
  } = useAppDataStore('jobAssets', { 
    jobId: jobId || '', 
    autoRefresh: false 
  });
  
  const { 
    data: jobFiles, 
    isLoading: isLoadingFiles,
    refresh: refetchFiles
  } = useAppDataStore('jobFiles', { 
    jobId: jobId || '', 
    autoRefresh: false 
  });

  // Transform jobData to maintain compatibility with existing components
  const effectiveJobData = jobData;
  const mergedJobData = jobData;
  const fileData = jobFiles || []; // Ensure fileData is always an array
  const error = jobError;
  
  // Local state for UI management
  const [localJobData, setLocalJobData] = useState(null);
  const [creatingAssets, setCreatingAssets] = useState(false);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  
  // Initialize other managers with hooks (simplified)
  const fileManager = {
    filesLoaded,
    setFilesLoaded,
    loadingFiles,
    setLoadingFiles,
    createNewFiles: async () => {
      // Handle file creation through useAppDataStore mutations if needed
      console.log('📁 File creation requested');
      setLoadingFiles(true);
      // Implementation would use mutateJob for file operations
      setLoadingFiles(false);
      setFilesLoaded(true);
    }
  };
  
  const psdTemplateManager = usePSDTemplateManager(jobData?.job_status);
  
  const loadingStateManager = useLoadingStateManager({
    isLoadingJob,
    isLoadingFiles,
    jobData,
    fileData,
    filesLoaded: fileManager.filesLoaded,
    createFiles
  });

  // Enhanced loading state management - derived from hooks
  const isLoading = loadingStateManager.loading || isLoadingJob || isLoadingAssets || isLoadingFiles;
  
  // Track if file creation has been triggered to prevent double execution
  const fileCreationTriggeredRef = useRef(false);
  
  // Simple callback to update job data (for upload engine compatibility)
  const updateJobDataForUpload = (updater: any) => {
    if (typeof updater === 'function') {
      const updated = updater(mergedJobData);
      setLocalJobData(updated);
      // Optionally trigger a refetch to sync with server
      refetchJobData();
    } else {
      setLocalJobData(updater);
      refetchJobData();
    }
  };

  // Upload management with comprehensive upload engine
  const uploadEngine = useUploadEngine({ 
    jobData: mergedJobData, 
    setJobData: updateJobDataForUpload,
    onUploadComplete: async () => {
      console.log('✅ Upload completed! All files have been uploaded successfully.');
      
      // Navigate to jobs list after a short delay to show completion
      setTimeout(() => {
        console.log('📍 Navigating to jobs list...');
        router.push('/jobs');
      }, 1500);
    }
  });

  // Debug upload engine state after initialization
  console.log('🔍 Upload Engine State:', {
    uploadsInProgress: uploadEngine.uploadStarted,
    totalPdfFiles: uploadEngine.totalPdfFiles,
    uploadedPdfFiles: uploadEngine.uploadedPdfFiles,
    allFilesUploaded: uploadEngine.allFilesUploaded,
    hasJobData: !!mergedJobData,
    jobDataFilesCount: mergedJobData?.content_pipeline_files?.length || 0,
    filesLoaded: fileManager.filesLoaded,
    timestamp: new Date().toISOString()
  });

  // Check if uploads are in progress
  const uploadsInProgress = uploadEngine.uploadStarted && !uploadEngine.allFilesUploaded;

  // Prevent browser navigation during uploads
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (uploadsInProgress) {
        e.preventDefault();
        e.returnValue = 'Files are currently uploading. Are you sure you want to leave? This will cancel the upload.';
        return 'Files are currently uploading. Are you sure you want to leave? This will cancel the upload.';
      }
    };

    const handlePopState = (e: PopStateEvent) => {
      if (uploadsInProgress) {
        const confirmLeave = window.confirm(
          'Files are currently uploading. Are you sure you want to leave? This will cancel the upload.'
        );
        if (!confirmLeave) {
          // Push the current state back to prevent navigation
          window.history.pushState(null, '', window.location.href);
          e.preventDefault();
          return false;
        }
      }
    };

    // Block navigation attempts during uploads
    if (uploadsInProgress) {
      // Add a dummy state to the history to intercept back button
      window.history.pushState(null, '', window.location.href);
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [uploadsInProgress]);

  // Legacy state sync is now handled by useLoadingStateManager hook

  // Get total loading steps from loading state manager
  const getTotalLoadingSteps = loadingStateManager.getTotalLoadingSteps;

  // PDF upload tracking is now handled by uploadState hook

  // Initial job loading and setup
  useEffect(() => {
    if (jobId) {
      // Debug: Check if pending files are available
      console.log('🔍 Initial page load - checking pending files:', {
        jobId,
        pendingFiles: (window as any).pendingUploadFiles ? {
          jobId: (window as any).pendingUploadFiles.jobId,
          filesCount: (window as any).pendingUploadFiles.files?.length || 0,
          fileNames: (window as any).pendingUploadFiles.files?.map((f: File) => f.name) || []
        } : null
      });
      
      // React Query handles job data loading automatically
      console.log('📋 React Query will handle job data loading for:', jobId);
    }
  }, [jobId]);

  // Legacy file loading useEffect removed - React Query handles this now
  // File data is now automatically loaded via useJobFiles hook

  // Reset file loading state when job ID changes (navigation to different job)
  useEffect(() => {
    console.log('🔄 Job ID changed, resetting file loading state');
    fileManager.setFilesLoaded(false);
    fileManager.setLoadingFiles(false);
    uploadEngine.resetUploadState();
    // Reset file creation trigger
    fileCreationTriggeredRef.current = false;
  }, [jobData?.job_id]); // Remove fileManager and uploadEngine from dependencies to prevent infinite loops

  // Auto-trigger file creation when createFiles=true or load existing files
  useEffect(() => {
    console.log('📋 File handling decision useEffect triggered:', {
      createFiles,
      hasJobData: !!jobData,
      hasJobFiles: !!jobFiles,
      filesLoaded: fileManager.filesLoaded,
      jobId: jobData?.job_id,
      alreadyTriggered: fileCreationTriggeredRef.current
    });
    
    if (createFiles === 'true' && jobData && !fileManager.filesLoaded && !fileCreationTriggeredRef.current) {
      console.log('🔄 Auto-triggering file creation for new job');
      fileCreationTriggeredRef.current = true;
      fileManager.createNewFiles();
    } else if (createFiles !== 'true' && jobFiles && !fileManager.filesLoaded) {
      console.log('📋 Files loaded from useAppDataStore, setting filesLoaded=true');
      fileManager.setFilesLoaded(true);
    } else if (fileManager.filesLoaded) {
      console.log('📋 Files already loaded, no action needed');
    } else {
      console.log('📋 Waiting for job data or files...');
    }
  }, [createFiles, jobData?.job_id, jobFiles, fileManager.filesLoaded]);

  // Trigger upload check when files are loaded
  useEffect(() => {
    uploadEngine.checkAndStartUpload(fileManager.filesLoaded);
  }, [fileManager.filesLoaded]); // Remove uploadEngine from dependencies to prevent infinite loops

  // (Reset logic moved to dedicated useEffect above)

  // Upload completion monitoring is now handled by the upload engine

  // PSD template fetching is now handled by usePSDTemplateManager hook

  // Physical JSON file fetching is now handled by usePSDTemplateManager hook

  // JSON file downloading is now handled by usePSDTemplateManager hook



  // Job details loading is now handled by useJobDetailsData hook

  // File loading is now handled by useFileManager hook

  // File creation is now handled by useFileManager hook

  // Update job status using centralized data store (handles cache automatically)
  const updateJobStatus = async (status: JobData['job_status']): Promise<void> => {
    if (!jobData?.job_id) return;
    
    try {
      console.log('🔄 Updating job status via useAppDataStore:', { status, jobId: jobData.job_id });
      
      // Use centralized mutation - this handles all caching automatically
      await mutateJob({
        type: 'updateJob',
        jobId: jobData.job_id,
        data: { 
          job_status: status,
          last_updated: new Date().toISOString()
        }
      });
      
      console.log('✅ Job status updated successfully via useAppDataStore');
    } catch (error) {
      console.error('❌ Error updating job status:', error);
      throw error;
    }
  };

  // S3 upload functions are now handled by the upload engine

  // File status updates are now handled by the upload engine

  // Debug functions are now handled by the upload engine

  // Upload functions are now handled by the upload engine

  // Upload process functions are now handled by the upload engine



  // Utility functions now imported from utils/fileOperations.ts



  if (isLoading) {
    return (
      <JobDetailsLoadingState
        loadingStep={loadingStateManager.loadingStep}
        totalSteps={getTotalLoadingSteps()}
        loadingMessage={loadingStateManager.loadingMessage}
        loadingDetail={loadingStateManager.loadingDetail}
      />
    );
  }

  if (!hasJobId) {
    return <JobDetailsErrorState error={null} message="No Job ID provided" />;
  }

  if (error) {
    return <JobDetailsErrorState error={error} />;
  }

  if (!mergedJobData && !isLoading) {
    return <JobDetailsErrorState error={null} message="No Job Data Found" />;
  }

  return (
    <JobDetailsContent
      mergedJobData={mergedJobData}
      jobData={jobData}
      uploadEngine={uploadEngine}
      uploadsInProgress={uploadsInProgress}
      creatingAssets={creatingAssets}
      setCreatingAssets={setCreatingAssets}
      loadingFiles={fileManager.loadingFiles}
      filesLoaded={fileManager.filesLoaded}
      loadingStep={loadingStateManager.loadingStep}
      loadingMessage={loadingStateManager.loadingMessage}
      loadingDetail={loadingStateManager.loadingDetail}
      loading={isLoading}
      onJobDataUpdate={(updatedJobData) => {
        console.log('🎯 onJobDataUpdate called with:', {
          hasUpdatedJobData: !!updatedJobData,
          isForceRefetch: !!updatedJobData?._forceRefetch,
          updatedJobDataAssets: updatedJobData?.assets ? Object.keys(updatedJobData.assets) : 'no assets',
          currentJobDataAssets: jobData?.assets ? Object.keys(jobData.assets) : 'no assets'
        });
        
        // Handle force refetch case (when backend doesn't return job data)
        if (updatedJobData?._forceRefetch) {
          console.log('🔄 Force refetch requested - refreshing all data via useAppDataStore');
          refetchJobData();
          return;
        }
        
        // Normal case: Job/asset data updated - useAppDataStore handles cache automatically
        console.log('🔄 Job data updated, refreshing via useAppDataStore');
        
        // Update local state for immediate UI feedback
        setLocalJobData(updatedJobData);
        
        // Refresh data to ensure consistency (useAppDataStore handles caching)
        refetchJobData();
      }}
      updateJobDataForUpload={updateJobDataForUpload}
      refetchJobData={refetchJobData}
      setLocalJobData={setLocalJobData}
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
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <Spinner />
          <p style={{ marginTop: 16, color: '#e0e0e0' }}>Loading job details...</p>
        </div>
      </div>
    }>
      <JobDetailsPageContent />
    </Suspense>
  );
} 