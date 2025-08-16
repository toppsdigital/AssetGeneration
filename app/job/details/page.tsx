'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
// useQueryClient removed - useAppDataStore handles all cache management
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
  useUploadEngine
} from '../../../hooks';
// Unused imports removed - simplified component no longer needs complex styling or types
import { useAppDataStore } from '../../../hooks/useAppDataStore';
//import { getTotalLoadingSteps, getJobTitle } from '../../../utils/fileOperations';

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

// UIJobData interface is now imported from shared types

// Skeleton components are now imported from components/

function JobDetailsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // queryClient removed - useAppDataStore handles all cache management
  
  // Extract query parameters using useSearchParams  
  const startUpload = searchParams.get('startUpload');
  const createFiles = searchParams.get('createFiles');
  const jobId = searchParams.get('jobId');
  
  // Skip data fetching if no jobId is provided
  const hasJobId = Boolean(jobId);
  
  // Single centralized data store call - handles everything
  const { 
    data: jobData, 
    isLoading: isLoadingJob, 
    error: jobError,
    refresh: refetchJobData,
    mutate: mutateJob
  } = useAppDataStore('jobDetails', { 
    jobId: jobId || '', 
    autoRefresh: false,
    includeFiles: createFiles !== 'true', // Only fetch existing files, not for new jobs
    includeAssets: true  // Always include assets when ready
  });

  // UI state only (no data state)
  const [creatingAssets, setCreatingAssets] = useState(false);
  
  // Clean data extraction - no local state mixing
  const fileData = jobData?.content_pipeline_files || [];
  const jobAssets = jobData?.assets || {};
  const error = jobError;
  
  // Removed updateJobDataForUpload - just pass refetchJobData directly
  
  // Simplified file manager - no local state management
  const fileManager = {
    filesLoaded: fileData.length > 0 || createFiles === 'true',
    loadingFiles: isLoadingJob,
    setFilesLoaded: () => {}, // No-op, useAppDataStore handles this
    setLoadingFiles: () => {}, // No-op, useAppDataStore handles this
    createNewFiles: async () => {
      if (!jobData?.job_id || !jobData?.api_files?.length) return;
      
      console.log('🔨 Creating new files via useAppDataStore');
      
      // Get the actual selected files from sessionStorage to know which PDFs exist
      const uploadSession = sessionStorage.getItem(`upload_${jobData.job_id}`);
      let actualPdfFiles: string[] = [];
      
      console.log('🔍 Checking sessionStorage for job:', jobData.job_id);
      
      if (uploadSession) {
        try {
          const session = JSON.parse(uploadSession);
          console.log('📋 Upload session data:', session);
          actualPdfFiles = session.files?.map((f: any) => f.name).filter((name: string) => 
            name.match(/_(FR|BK)\.pdf$/i)
          ) || [];
          console.log('📁 Found actual PDF files from session:', actualPdfFiles);
        } catch (error) {
          console.error('Failed to parse upload session:', error);
        }
      } else {
        console.log('⚠️ No sessionStorage found for upload session');
      }
      
      // If no session data, fall back to assuming both FR and BK exist (backward compatibility)
      if (actualPdfFiles.length === 0) {
        console.log('⚠️ No session data found, assuming both _FR.pdf and _BK.pdf for each base name');
        console.log('🔍 jobData.api_files:', jobData.api_files);
        actualPdfFiles = jobData.api_files.flatMap(baseName => [
          `${baseName}_FR.pdf`,
          `${baseName}_BK.pdf`
        ]);
        console.log('📁 Fallback PDF files generated:', actualPdfFiles);
      }
      
      // Group actual PDF files by base name
      const fileGroups = new Map<string, {name: string, type: 'front' | 'back'}[]>();
      actualPdfFiles.forEach(pdfName => {
        console.log('🔍 Processing PDF file:', pdfName);
        const match = pdfName.match(/^(.+)_(FR|BK)\.pdf$/i);
        if (match) {
          const baseName = match[1];
          const suffix = match[2].toUpperCase();
          const cardType = suffix === 'FR' ? 'front' : 'back';
          
          console.log(`📝 Matched: baseName="${baseName}", suffix="${suffix}", cardType="${cardType}"`);
          
          if (!fileGroups.has(baseName)) {
            fileGroups.set(baseName, []);
          }
          fileGroups.get(baseName)!.push({name: pdfName, type: cardType});
        } else {
          console.warn(`⚠️ PDF file doesn't match expected pattern: ${pdfName}`);
        }
      });
      
      console.log('📋 File groups for creation:', Array.from(fileGroups.entries()));
      console.log('📊 File groups summary:', Array.from(fileGroups.entries()).map(([base, files]) => ({
        baseName: base,
        files: files.map(f => ({ name: f.name, type: f.type }))
      })));
      
      await mutateJob({
        type: 'createFiles',
        jobId: jobData.job_id, // ✅ Add jobId so cache invalidation works
        data: Array.from(fileGroups.entries()).map(([baseName, pdfs]) => {
          const originalFiles: Record<string, any> = {};
          console.log(`📁 Creating file object for baseName="${baseName}" with ${pdfs.length} PDFs:`, pdfs);
          
          pdfs.forEach(pdf => {
            console.log(`  📄 Adding PDF: ${pdf.name} (${pdf.type})`);
            originalFiles[pdf.name] = {
              card_type: pdf.type,
              status: 'uploading',
              file_path: `asset_generator/dev/uploads/${pdf.name}`
            };
          });
          
          const fileObject = {
            filename: baseName,
            job_id: jobData.job_id,
            file_path: `asset_generator/dev/uploads/${baseName}`,
            original_files: originalFiles
          };
          
          console.log(`✅ File object created:`, JSON.stringify(fileObject, null, 2));
          return fileObject;
        })
      });
      
      // useAppDataStore automatically updates cache via invalidation
      console.log('✅ Files created, useAppDataStore will invalidate job details cache');
      console.log('🔄 Waiting for job details cache to refresh with new files...');
    }
  };
  
  // Simplified loading state - pure useAppDataStore
  const isLoading = isLoadingJob;
  
  // Track if file creation has been triggered to prevent double execution
  const fileCreationTriggeredRef = useRef(false);
  
  // Simplified upload engine - no manual state management
  const uploadEngine = useUploadEngine({ 
    jobData: jobData, 
    setJobData: () => {}, // No-op, useAppDataStore handles updates
    onUploadComplete: async () => {
      console.log('✅ Upload completed! All files have been uploaded successfully.');
      
      // Refresh job data to get latest state
      await refetchJobData();
      
      // Navigate to jobs list after a short delay
      setTimeout(() => {
        console.log('📍 Navigating to jobs list...');
        router.push('/jobs');
      }, 1500);
    }
  });

  // Enhanced debug logging to trace file creation → upload flow
  console.log('🔍 Job Details State (Pure useAppDataStore):', {
    timestamp: new Date().toISOString(),
    jobId: jobId,
    hasJobData: !!jobData,
    isLoading: isLoading,
    createFiles: createFiles,
    fileCreationTriggered: fileCreationTriggeredRef.current,
    jobApiFiles: jobData?.api_files?.length || 0,
    filesCount: fileData.length,
    fileDetails: fileData.map(f => ({
      filename: f.filename,
      originalFilesCount: Object.keys(f.original_files || {}).length,
      hasUploadingStatus: Object.values(f.original_files || {}).some((info: any) => info.status === 'uploading')
    })),
    uploadEngineState: {
      uploadedCount: uploadEngine.uploadedPdfFiles,
      totalCount: uploadEngine.totalPdfFiles,
      uploadingFilesCount: uploadEngine.uploadingFiles.size,
      uploadStarted: uploadEngine.uploadStarted
    }
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

  // No complex loading state management needed

  // PDF upload tracking is now handled by uploadState hook

  // Initial job loading and setup
  useEffect(() => {
    if (jobId) {
      // Clean architecture: No global state dependencies
      console.log('🔍 Initial page load - pure useAppDataStore approach:', {
        jobId,
        approach: 'Pure React Query cache + useAppDataStore mutations'
      });
      
      // React Query handles job data loading automatically
      console.log('📋 React Query will handle job data loading for:', jobId);
    }
  }, [jobId]);

  // Legacy file loading useEffect removed - React Query handles this now
  // File data is now automatically loaded via useJobFiles hook

  // Reset state when job ID changes
  useEffect(() => {
    console.log('🔄 Job ID changed, resetting state');
    uploadEngine.resetUploadState();
    fileCreationTriggeredRef.current = false;
  }, [jobData?.job_id]);

  // Simplified file creation - triggered once when needed
  useEffect(() => {
    console.log('🔍 File creation useEffect check:', {
      createFiles,
      hasJobId: !!jobData?.job_id,
      jobId: jobData?.job_id,
      fileCreationTriggered: fileCreationTriggeredRef.current,
      fileDataLength: fileData.length,
      shouldTrigger: createFiles === 'true' && jobData?.job_id && !fileCreationTriggeredRef.current && fileData.length === 0
    });
    
    if (createFiles === 'true' && jobData?.job_id && !fileCreationTriggeredRef.current && fileData.length === 0) {
      console.log('🔄 Auto-triggering file creation for new job');
      fileCreationTriggeredRef.current = true;
      fileManager.createNewFiles();
    } else {
      console.log('⏸️ File creation conditions not met');
    }
  }, [createFiles, jobData?.job_id, fileData.length]);

  // Trigger upload check when files are available
  useEffect(() => {
    console.log('📁 Upload trigger useEffect:', {
      fileDataLength: fileData.length,
      uploadStarted: uploadEngine.uploadStarted,
      shouldTriggerUpload: fileData.length > 0 && !uploadEngine.uploadStarted
    });
    
    if (fileData.length > 0) {
      console.log('🚀 Files available, triggering upload check...');
      uploadEngine.checkAndStartUpload(true);
    } else {
      console.log('⏳ No files available yet, waiting for file creation to complete...');
    }
  }, [fileData.length]);

  // (Reset logic moved to dedicated useEffect above)

  // Upload completion monitoring is now handled by the upload engine

  // PSD template fetching is now handled by usePSDTemplateManager hook

  // Physical JSON file fetching is now handled by usePSDTemplateManager hook

  // JSON file downloading is now handled by usePSDTemplateManager hook



  // Job details loading is now handled by useJobDetailsData hook

  // File loading is now handled by useFileManager hook

  // File creation is now handled by useFileManager hook

  // Update job status using centralized data store (handles cache automatically)
  const updateJobStatus = async (status: string): Promise<void> => {
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
      uploadEngine={uploadEngine}
      uploadsInProgress={uploadsInProgress}
      creatingAssets={creatingAssets}
      setCreatingAssets={setCreatingAssets}
      loadingFiles={false}
      filesLoaded={fileData.length > 0}
      loadingStep={1}
      loadingMessage="Ready"
      loadingDetail=""
      loading={isLoading}
      onJobDataUpdate={(updatedJobData) => {
        // Handle force refetch case or normal updates - both just refresh from server
        console.log('🎯 onJobDataUpdate - refreshing via useAppDataStore');
        refetchJobData();
      }}
      updateJobDataForUpload={refetchJobData} // Simplified to just refetch
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