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
  useJobDetailsData, 
  useFileManager, 
  usePSDTemplateManager, 
  useLoadingStateManager 
} from '../../../hooks';
import styles from '../../../styles/Edit.module.css';
import Spinner from '../../../components/Spinner';
import { contentPipelineApi, JobData, FileData } from '../../../web/utils/contentPipelineApi';
import { useJobData, useJobFiles, useUpdateJobStatus, UIJobData, jobKeys, syncJobDataAcrossCaches } from '../../../web/hooks/useJobData';
import { useQueryClient } from '@tanstack/react-query';
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
  
  // React Query hooks for smart caching
  const queryClient = useQueryClient();
  
  // Use centralized job details data management
  const {
    jobData,
    effectiveJobData,
    mergedJobData,
    fileData,
    localJobData,
    isLoading: isLoadingJob,
    isLoadingFiles,
    error,
    refetchJobData,
    updateJobDataForUpload,
    setLocalJobData,
    jobId
  } = useJobDetailsData({ startUpload, createFiles });
  
  // Initialize other managers with hooks
  const fileManager = useFileManager({ 
    jobData, 
    setLocalJobData, 
    queryClient, 
    jobKeys 
  });
  
  const psdTemplateManager = usePSDTemplateManager(jobData?.job_status);
  
  const loadingStateManager = useLoadingStateManager({
    isLoadingJob,
    isLoadingFiles,
    jobData,
    fileData,
    filesLoaded: fileManager.filesLoaded,
    createFiles
  });
  
  // Status update mutation
  const updateJobStatusMutation = useUpdateJobStatus();
  const [creatingAssets, setCreatingAssets] = useState(false);

  // Enhanced loading state management - derived from hooks
  const isLoading = loadingStateManager.loading;
  
  // Track if file creation has been triggered to prevent double execution
  const fileCreationTriggeredRef = useRef(false);

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

  // Auto-trigger file creation when createFiles=true
  useEffect(() => {
    console.log('📋 File handling decision useEffect triggered:', {
      createFiles,
      shouldFetchFiles: createFiles !== 'true',
      hasJobData: !!jobData,
      filesLoaded: fileManager.filesLoaded,
      jobId: jobData?.job_id,
      apiFilesCount: jobData?.api_files?.length || 0,
      alreadyTriggered: fileCreationTriggeredRef.current
    });
    
    if (createFiles === 'true' && jobData && !fileManager.filesLoaded && !fileCreationTriggeredRef.current) {
      console.log('🔄 Auto-triggering file creation for new job');
      fileCreationTriggeredRef.current = true;
      fileManager.createNewFiles();
    } else if (createFiles !== 'true' && jobData && !fileManager.filesLoaded) {
      console.log('📋 createFiles=false, will fetch existing files via useJobFiles hook');
    } else if (fileManager.filesLoaded) {
      console.log('📋 Files already loaded, no action needed');
    } else {
      console.log('📋 Waiting for job data...');
    }
  }, [createFiles, jobData?.job_id, fileManager.filesLoaded]); // Use specific primitive values instead of objects

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

    // Update job status using Content Pipeline API with cache synchronization
  const updateJobStatus = async (status: JobData['job_status']): Promise<void> => {
    if (!jobData?.job_id) return;
    
    try {
      console.log('Updating job status:', { status });
      const response = await contentPipelineApi.updateJobStatus(
        jobData.job_id,
        status
      );
      
      console.log('Job status updated successfully:', response.job);
      
      // Update both React Query caches and legacy state
      console.log('🔄 Synchronizing job status update across all caches at', new Date().toISOString());
      
      // Use cache synchronization utility to update both caches
      syncJobDataAcrossCaches(queryClient, jobData.job_id, (prevJobData) => {
        const prevUIJobData = prevJobData as UIJobData;
        const updatedJob: UIJobData = {
          ...response.job,
          api_files: response.job.files, // Store API files separately
          files: prevUIJobData.files || [], // Preserve existing legacy files
          content_pipeline_files: prevUIJobData.content_pipeline_files || [], // Preserve current Content Pipeline files with updated statuses
          Subset_name: response.job.source_folder // Map source_folder to Subset_name for UI compatibility
        };
        return updatedJob;
      });
      
      // Also update local state for backward compatibility
      setLocalJobData(prevJobData => {
        if (!prevJobData) return prevJobData;
        
        return {
          ...response.job,
          api_files: response.job.files, // Store API files separately
          files: prevJobData.files || [], // Preserve existing legacy files
          content_pipeline_files: prevJobData.content_pipeline_files || [], // Preserve current Content Pipeline files with updated statuses
          Subset_name: response.job.source_folder // Map source_folder to Subset_name for UI compatibility
        };
      });
      
      console.log('✅ Job status synchronized across all caches and legacy state');
    } catch (error) {
      console.error('Error updating job status:', error);
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

  if (error) {
    return <JobDetailsErrorState error={error} />;
  }

  if (!mergedJobData) {
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
          console.log('🔄 Force refetch requested - asset created but no job data returned');
          refetchJobData().then((result) => {
            console.log('✅ Refetched job data after asset creation:', {
              hasData: !!result.data,
              assets: result.data?.assets ? Object.keys(result.data.assets) : 'no assets'
            });
            if (result.data) {
              setLocalJobData(result.data);
            }
          });
          return;
        }
        
        // Normal case: Update React Query cache with updated job data from asset operations
        // Map API response to UIJobData format to preserve UI-specific fields
        const mappedJobData = {
          ...effectiveJobData, // Preserve existing UI fields (api_files, content_pipeline_files, etc.)
          ...updatedJobData, // Overlay new server data (including updated assets)
          api_files: updatedJobData.files || effectiveJobData?.api_files || [],
          Subset_name: updatedJobData.source_folder || effectiveJobData?.Subset_name,
          // Force new object references to trigger React re-render
          assets: updatedJobData?.assets ? { ...updatedJobData.assets } : (effectiveJobData?.assets ? { ...effectiveJobData.assets } : {}),
          _cacheTimestamp: Date.now()
        };
        
        console.log('🔄 Updating job data from PSDTemplateSelector:', {
          previous: Object.keys(effectiveJobData?.assets || {}),
          new: Object.keys(updatedJobData?.assets || {}),
          jobId: updatedJobData?.job_id,
          hasAssets: !!mappedJobData.assets,
          assetsCount: mappedJobData.assets ? Object.keys(mappedJobData.assets).length : 0,
          assetIds: mappedJobData.assets ? Object.keys(mappedJobData.assets) : [],
          updatedJobDataType: typeof updatedJobData?.assets,
          updatedJobDataAssets: updatedJobData?.assets,
          mappedJobDataAssets: mappedJobData.assets
        });
        
        // Update React Query cache
        if (jobData?.job_id) {
          syncJobDataAcrossCaches(queryClient, jobData.job_id, () => mappedJobData);
        }
        
        // FORCE UI UPDATE: Update local state to ensure UI reflects new data immediately
        console.log('🚀 Setting local job data to force UI update');
        setLocalJobData(mappedJobData);
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