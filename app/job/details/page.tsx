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
  FileCard 
} from '../../../components';
import { useUploadEngine } from '../../../hooks';
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
  const jobId = searchParams.get('jobId');
  const startUpload = searchParams.get('startUpload');
  const createFiles = searchParams.get('createFiles');
  
  // React Query hooks for smart caching
  const queryClient = useQueryClient();
  
  // Smart cache invalidation - skip for completed jobs since they don't change
  useEffect(() => {
    if (jobId) {
      // Check if we have cached job data to determine if it's completed
      const cachedJobData = queryClient.getQueryData<UIJobData>(jobKeys.detail(jobId));
      const isCompleted = ['complete', 'completed'].includes(cachedJobData?.job_status?.toLowerCase() || '');
      
      if (isCompleted) {
        console.log('✅ Job is completed - skipping cache invalidation (only download URLs may need refresh)');
        // Note: For completed jobs, only download URLs (presigned S3 URLs) may expire and need refreshing
        // This should be handled at the component level when downloads fail, not here
      } else {
        console.log('🔄 Forcing cache invalidation for active job:', jobId);
        // Remove both job detail and files caches to ensure fresh data for active jobs
        queryClient.removeQueries({ queryKey: jobKeys.detail(jobId) });
        queryClient.removeQueries({ queryKey: jobKeys.files(jobId) });
      }
    }
  }, [jobId, queryClient]);
  
  // Always use React Query caching - let it handle cached data automatically
  const { 
    data: jobData, 
    isLoading: isLoadingJob, 
    error: jobError,
    isFetching: isRefetchingJob,
    refetch: refetchJobData
  } = useJobData(jobId || null);

  // Local state to force UI updates when cache doesn't trigger re-render
  const [localJobData, setLocalJobData] = useState(null);
  
  // Use local data if available, otherwise use React Query data
  const effectiveJobData = localJobData || jobData;
  
  // Debug logging for cache behavior and fresh data synchronization
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
  
        // Check if we have fresher data in jobs list cache and sync it
    if (jobId && jobData) {
      const jobsListData = queryClient.getQueryData<JobData[]>(jobKeys.all);
      const freshJobFromList = jobsListData?.find(job => job.job_id === jobId);
      
      if (freshJobFromList && freshJobFromList.job_status !== jobData.job_status) {
        console.log('🔄 Found fresher job status in jobs list cache. Syncing...', {
          currentStatus: jobData.job_status,
          freshStatus: freshJobFromList.job_status,
          jobId
      });
      
        // Update the individual job cache with fresh data from jobs list
        syncJobDataAcrossCaches(queryClient, jobId, (prevJobData) => ({
          ...prevJobData,
          job_status: freshJobFromList.job_status,
          last_updated: freshJobFromList.last_updated || new Date().toISOString()
        }));
        
        // Only force refetch for non-completed jobs since completed jobs don't change
        const isCompleted = ['complete', 'completed'].includes(freshJobFromList.job_status?.toLowerCase() || '');
        if (!isCompleted) {
          console.log('🔄 Force refetching job data to ensure absolute freshness');
          refetchJobData();
        } else {
          console.log('✅ Job is completed - skipping refetch (data is stable)');
        }
      }
    }
  }, [jobId, jobData, isLoadingJob, isRefetchingJob, jobError, queryClient]);
  

  
  // File data fetching with caching - only when NOT creating files
  const shouldFetchFiles = createFiles !== 'true';
  
  console.log('🔍 useJobFiles parameters:', {
    createFiles,
    shouldFetchFiles,
    jobId: shouldFetchFiles ? (jobData?.job_id || null) : null,
    apiFilesCount: shouldFetchFiles ? (jobData?.api_files || []).length : 0,
    enabled: shouldFetchFiles
  });
  
  const { 
    data: fileData = [], 
    isLoading: isLoadingFiles,
    error: filesError,
    refetch: refetchFileData 
  } = useJobFiles(
    shouldFetchFiles ? (jobData?.job_id || null) : null, 
    shouldFetchFiles ? (jobData?.api_files || []) : [],
    shouldFetchFiles // Disable the hook when createFiles=true
  );
  
  // Merge cached job data with fresh file data
  const mergedJobData = effectiveJobData ? {
    ...effectiveJobData,
    // When createFiles='true', use files from jobData (set by createNewFiles)
    // When createFiles!='true', use fresh fileData from useJobFiles hook
    content_pipeline_files: createFiles === 'true' ? (effectiveJobData.content_pipeline_files || []) : fileData
  } : null;

  // Debug assets in mergedJobData
  console.log('🔍 mergedJobData assets debug:', {
    hasJobData: !!jobData,
    hasMergedJobData: !!mergedJobData,
    jobDataAssets: jobData?.assets ? Object.keys(jobData.assets) : 'no assets',
    mergedJobDataAssets: mergedJobData?.assets ? Object.keys(mergedJobData.assets) : 'no assets',
    jobDataTimestamp: new Date().toISOString()
  });

  // Debug logging for upload data flow
  console.log('🔍 Upload Data Flow Debug:', {
    createFiles,
    hasJobData: !!jobData,
    hasMergedJobData: !!mergedJobData,
    jobDataFiles: jobData?.content_pipeline_files?.length || 0,
    mergedJobDataFiles: mergedJobData?.content_pipeline_files?.length || 0,
    fileDataLength: fileData.length,
    timestamp: new Date().toISOString()
  });
  
  // Debug logging for file source
  console.log('🔍 mergedJobData file source:', {
    createFiles,
    usingJobDataFiles: createFiles === 'true',
    jobDataFilesCount: jobData?.content_pipeline_files?.length || 0,
    fileDataCount: fileData.length,
    finalCount: mergedJobData?.content_pipeline_files?.length || 0,
    jobDataExists: !!jobData,
    jobDataStructure: jobData ? Object.keys(jobData) : 'no jobData',
    shouldFetchFiles,
    jobStatus: jobData?.job_status
  });
  
  // Status update mutation
  const updateJobStatusMutation = useUpdateJobStatus();
  const [physicalJsonFiles, setPhysicalJsonFiles] = useState<Array<{name: string; lastModified: string | null; json_url?: string}>>([]);
  const [loadingPhysicalFiles, setLoadingPhysicalFiles] = useState(false);
  const [selectedPhysicalFile, setSelectedPhysicalFile] = useState<string>('');
  const [jsonData, setJsonData] = useState<any>(null);
  const [loadingJsonData, setLoadingJsonData] = useState(false);
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(new Set());
  const [selectedExtractedLayers, setSelectedExtractedLayers] = useState<Set<string>>(new Set());
  const [creatingAssets, setCreatingAssets] = useState(false);

  // Enhanced loading state management - derived from React Query states
  const isLoading = isLoadingJob && !jobData; // Only show loading if no cached data
  const isLoadingData = isLoadingJob || isLoadingFiles;
  const error = jobError || filesError;
  
  // Legacy state variables still needed by existing components
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  
  // Temporary legacy setters (will be removed after full React Query migration)
  const [loading, setLoading] = useState(false);
  const [legacyError, setError] = useState<string | null>(null);
  const [legacyJobData, setJobData] = useState<UIJobData | null>(null);
  
  const [loadingStep, setLoadingStep] = useState(1);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [loadingDetail, setLoadingDetail] = useState<string | undefined>(undefined);
  
  // Track if file creation has been triggered to prevent double execution
  const fileCreationTriggeredRef = useRef(false);

  // Create a proper data updater that updates React Query cache with synchronization
  const updateJobDataForUpload = useCallback((updater: (prev: any) => any) => {
    // Update both React Query caches using synchronization utility
    if (jobData?.job_id) {
      syncJobDataAcrossCaches(queryClient, jobData.job_id, updater);
      
      // Force a refetch to ensure UI updates
      setTimeout(() => {
        console.log('🔄 Force refetching job data to ensure UI update');
        refetchJobData();
      }, 100);
    }
    // Also update legacy state for any remaining dependencies
    setJobData(updater);
  }, [jobData?.job_id, queryClient, refetchJobData]);

  // Upload management with comprehensive upload engine
  const uploadEngine = useUploadEngine({ 
    jobData: mergedJobData, 
    setJobData: updateJobDataForUpload,
    onUploadComplete: async () => {
      console.log('✅ Upload completed! Updating job status to "uploaded"...');
      
      try {
        // Update job status to 'uploaded' when all files are uploaded
        await updateJobStatus('uploaded');
        console.log('✅ Job status updated to "uploaded" successfully');
        
        // Navigate to jobs list after status update
        setTimeout(() => {
          console.log('📍 Navigating to jobs list...');
          router.push('/jobs');
        }, 1500);
      } catch (error) {
        console.error('❌ Failed to update job status to "uploaded":', error);
        
        // Still navigate even if status update fails
        setTimeout(() => {
          console.log('📍 Navigating to jobs list (despite status update failure)...');
          router.push('/jobs');
        }, 1500);
      }
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
    filesLoaded,
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

  // Sync legacy state with React Query state - ONLY when NOT in create mode
  useEffect(() => {
    // Skip sync when in create mode to avoid conflicts with createNewFiles()
    if (createFiles === 'true') {
      console.log('🔄 Skipping legacy state sync - in create mode');
      return;
    }
    
    // Update file loading states based on React Query
    const hasFiles = fileData.length > 0;
    const shouldMarkFilesLoaded = !isLoadingFiles && (hasFiles || (jobData && (!jobData.api_files || jobData.api_files.length === 0)));
    
    console.log('🔄 Syncing legacy state (fetch mode):', {
      isLoadingFiles,
      fileDataLength: fileData.length,
      hasApiFiles: jobData?.api_files?.length || 0,
      shouldMarkFilesLoaded,
      currentFilesLoaded: filesLoaded
    });
    
    setFilesLoaded(shouldMarkFilesLoaded);
    setLoadingFiles(isLoadingFiles);
    
    // Sync loading state
    setLoading(isLoadingJob && !jobData);
    
    // Update loading steps and messages based on React Query state
    if (isLoadingJob && !jobData) {
      setLoadingStep(1);
      setLoadingMessage('Loading job details...');
      setLoadingDetail('Fetching job information');
    } else if (isLoadingFiles) {
      setLoadingStep(2);
      setLoadingMessage('Loading files...');
      setLoadingDetail(`Fetching ${jobData?.api_files?.length || 0} file objects`);
    } else if (shouldMarkFilesLoaded) {
      const isExtracted = jobData?.job_status?.toLowerCase() === 'extracted';
      setLoadingStep(isExtracted ? 4 : 2);
      setLoadingMessage(isExtracted ? 'Ready for PSD selection' : 'Files loaded successfully');
      setLoadingDetail(`${fileData.length} files ready`);
    }
    
    // Clear any legacy errors if React Query data is successful
    if (jobData && !error) {
      setError(null);
    }
  }, [createFiles, isLoadingFiles, fileData, isLoadingJob, jobData, error, filesLoaded]);

  // Calculate total loading steps based on job status
  const getTotalLoadingSteps = () => {
    const isExtracted = mergedJobData?.job_status?.toLowerCase() === 'extracted';
    return isExtracted ? 4 : 2; // 1-2 for basic loading, 3-4 for extracted jobs with PSD loading
  };

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
    setFilesLoaded(false);
    setLoadingFiles(false);
    uploadEngine.resetUploadState();
    // Reset file creation trigger
    fileCreationTriggeredRef.current = false;
  }, [jobData?.job_id]);

  // Auto-trigger file creation when createFiles=true
  useEffect(() => {
    console.log('📋 File handling decision useEffect triggered:', {
      createFiles,
      shouldFetchFiles: createFiles !== 'true',
      hasJobData: !!jobData,
      filesLoaded,
      jobId: jobData?.job_id,
      apiFilesCount: jobData?.api_files?.length || 0,
      alreadyTriggered: fileCreationTriggeredRef.current
    });
    
    if (createFiles === 'true' && jobData && !filesLoaded && !fileCreationTriggeredRef.current) {
      console.log('🔄 Auto-triggering file creation for new job');
      fileCreationTriggeredRef.current = true;
      createNewFiles();
    } else if (createFiles !== 'true' && jobData && !filesLoaded) {
      console.log('📋 createFiles=false, will fetch existing files via useJobFiles hook');
    } else if (filesLoaded) {
      console.log('📋 Files already loaded, no action needed');
    } else {
      console.log('📋 Waiting for job data...');
    }
  }, [createFiles, jobData, filesLoaded]);

  // Trigger upload check when files are loaded
  useEffect(() => {
    uploadEngine.checkAndStartUpload(filesLoaded);
  }, [filesLoaded, uploadEngine]);

  // (Reset logic moved to dedicated useEffect above)

  // Upload completion monitoring is now handled by the upload engine

  // Fetch physical JSON files when status is "extracted"
  useEffect(() => {
    if (jobData?.job_status?.toLowerCase() === 'extracted') {
      fetchPhysicalJsonFiles();
    }
  }, [jobData?.job_status]);

  // Function to fetch physical JSON files from S3 proxy
  const fetchPhysicalJsonFiles = async () => {
    try {
      setLoadingPhysicalFiles(true);
      // Only set loading step for PSD loading if status is extracted
      if (jobData?.job_status?.toLowerCase() === 'extracted') {
        setLoadingStep(3);
        setLoadingMessage('Loading PSD templates...');
        setLoadingDetail('Fetching available physical PSD files');
      }
      
      console.log('🔍 Fetching physical JSON files from public endpoint...');
      
      const response = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          client_method: 'fetch_public_files',
          public_url: 'https://topps-nexus-powertools.s3.us-east-1.amazonaws.com/asset_generator/dev/public/digital_to_physical_psd_files.json',
          file_type: 'psd'
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch JSON files: ${response.status}`);
      }

      const data = await response.json();
      console.log('📁 Physical PSD files response:', data);
      
      // The new API returns files in the format:
      // { files: [{ file_name: "...", display_name: "...", json_url: "..." }], total_count: ... }
      const physicalFiles = (data.files || []).map((file: any) => ({
        name: file.file_name || file.name || '',
        lastModified: null, // Not available in the new format
        json_url: file.json_url // Store the json_url for later use
      }));
      
      console.log('🎯 Formatted physical JSON files:', physicalFiles);
      setPhysicalJsonFiles(physicalFiles);
      
    } catch (error) {
      console.error('❌ Error fetching physical JSON files:', error);
    } finally {
      setLoadingPhysicalFiles(false);
    }
  };

  // Function to download and parse JSON file via S3 proxy (to avoid CORS)
  const downloadJsonFile = async (selectedFile: string) => {
    try {
      setLoadingJsonData(true);
      // Only set loading step for JSON data if status is extracted
      if (jobData?.job_status?.toLowerCase() === 'extracted') {
        setLoadingStep(4);
        setLoadingMessage('Loading PSD data...');
        setLoadingDetail(`Parsing ${selectedFile.split('/').pop()?.replace('.json', '.psd') || 'template'}`);
      }
      setJsonData(null);
      
      console.log('🔍 Downloading JSON via S3 proxy for selected file:', selectedFile);
      
      // Find the selected file in physicalJsonFiles to get its json_url
      const selectedFileData = physicalJsonFiles.find(file => file.name === selectedFile);
      
      if (!selectedFileData || !selectedFileData.json_url) {
        throw new Error(`JSON URL not found for file: ${selectedFile}`);
      }
      
      console.log('🔗 Using JSON URL:', selectedFileData.json_url);
      console.log('📋 Available physical files:', physicalJsonFiles.map(f => ({ name: f.name, json_url: f.json_url })));
      
      const jsonUrl = selectedFileData.json_url;
      
      // Always use S3 proxy to avoid CORS issues, but handle both file paths and full URLs
      const requestBody = { 
        client_method: 'get',
        filename: jsonUrl,
        download: true,  // This tells the proxy to fetch and return the content directly
        direct_url: jsonUrl.startsWith('http://') || jsonUrl.startsWith('https://') // Flag for proxy to know it's a direct URL
      };
      
      console.log('📤 S3 proxy request body:', requestBody);
      
      const response = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      console.log('📥 S3 proxy response status:', response.status);
      console.log('📥 S3 proxy response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        // Try to get more details about the error
        let errorDetails = `Status: ${response.status}`;
        try {
          const errorBody = await response.text();
          console.log('❌ S3 proxy error response body:', errorBody);
          errorDetails += ` - ${errorBody}`;
        } catch (e) {
          console.log('❌ Could not read error response body:', e);
        }
        throw new Error(`Failed to download JSON via proxy: ${errorDetails}`);
      }
      
      const jsonData = await response.json();
      console.log('📋 JSON data loaded successfully via proxy, keys:', Object.keys(jsonData || {}));
      
      if (jsonData && typeof jsonData === 'object') {
        setJsonData(jsonData);
      } else {
        throw new Error('Invalid JSON content received from proxy');
      }
      
    } catch (error) {
      console.error('❌ Error downloading JSON via proxy:', error);
      setJsonData(null);
    } finally {
      setLoadingJsonData(false);
    }
  };

  // Download JSON when file is selected
  useEffect(() => {
    if (selectedPhysicalFile) {
      downloadJsonFile(selectedPhysicalFile);
    } else {
      setJsonData(null);
    }
    // Clear selected layers when changing files
    setSelectedLayers(new Set());
    setSelectedExtractedLayers(new Set());
  }, [selectedPhysicalFile]);



  const loadJobDetails = async () => {
    try {
      setLoading(true);
      setLoadingStep(1);
      setLoadingMessage('Loading job details...');
      setLoadingDetail('Fetching job information from API');
      
      // Reset file-related state when loading a new job
      setFilesLoaded(false);
      setLoadingFiles(false);
      
      console.log('Loading job details for jobId:', jobId);
      const response = await contentPipelineApi.getJob(jobId as string);
      
      console.log('Job details loaded:', response.job);
      
      // Map API response to our local interface, preserving existing files
      setJobData(prevJobData => {
        const mappedJobData: UIJobData = {
          ...response.job,
          api_files: response.job.files, // Store API files separately
          files: prevJobData?.files || [], // Preserve existing legacy files
          content_pipeline_files: prevJobData?.content_pipeline_files || [], // Preserve existing Content Pipeline files
            Subset_name: response.job.source_folder // Map source_folder to Subset_name for UI compatibility
        };
        
        console.log('🔄 setJobData called from: loadJobDetails (preserving existing files) at', new Date().toISOString());
        console.log('📊 Preserved files:', mappedJobData.content_pipeline_files?.length || 0);
        return mappedJobData;
      });
      
    } catch (error) {
      console.error('Error loading job details:', error);
      setError('Failed to load job details: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Load existing file objects using batch read
  const loadExistingFiles = async () => {
    if (!jobData || !jobData.api_files || jobData.api_files.length === 0) return;
    
    try {
      setLoadingFiles(true);
      setLoadingStep(2);
      setLoadingMessage('Loading files...');
      setLoadingDetail(`Fetching ${jobData.api_files.length} file objects`);
      
      console.log('Fetching existing file objects for:', jobData.api_files);
      
      // Batch read existing files
      const batchResponse = await contentPipelineApi.batchGetFiles(jobData.api_files);
      
      console.log('Batch read response:', batchResponse);
      
      // Validate response before processing
      if (!batchResponse.files || !Array.isArray(batchResponse.files)) {
        console.error('Invalid response format from batchGetFiles:', batchResponse);
        throw new Error('Invalid response format from API');
      }
      
      // Map API response to our ContentPipelineFile format
      const fileObjects: FileData[] = batchResponse.files.map(apiFile => ({
        filename: apiFile.filename,
        job_id: apiFile.job_id,
        last_updated: apiFile.last_updated || new Date().toISOString(),
        original_files: apiFile.original_files || {},
        extracted_files: apiFile.extracted_files || {},
        firefly_assets: apiFile.firefly_assets || {}
      }));
      
      // Only update if we actually got files back
      if (fileObjects.length > 0) {
        // Update job data with fetched files
        const updatedJobData = {
          ...jobData,
          content_pipeline_files: fileObjects
        };
        
        console.log('✅ Loaded existing files successfully, checking if upload should start...');
        console.log('Job status:', jobData.job_status);
        console.log('Files loaded:', fileObjects.length);
        
        console.log('🔄 setJobData called from: loadExistingFiles at', new Date().toISOString());
        setJobData(updatedJobData);
        setFilesLoaded(true);
        
        // Set appropriate completion step based on job status
        const isExtracted = jobData.job_status?.toLowerCase() === 'extracted';
        setLoadingStep(isExtracted ? 2 : 2); // Step 2 for file loading completion
        setLoadingMessage(isExtracted ? 'Files loaded - Ready for PSD selection' : 'Files loaded successfully');
        setLoadingDetail(`${fileObjects.length} file objects ready`);
      } else {
        console.warn('⚠️ No files returned from API, keeping existing state');
        setFilesLoaded(true); // Still mark as loaded to prevent retries
        
        const isExtracted = jobData.job_status?.toLowerCase() === 'extracted';
        setLoadingStep(isExtracted ? 2 : 2);
        setLoadingMessage(isExtracted ? 'Files ready - Ready for PSD selection' : 'Files loaded');
        setLoadingDetail('No additional files found');
      }
      
    } catch (error) {
      console.error('Error fetching file objects:', error);
      setError('Failed to fetch file objects: ' + (error as Error).message);
      // Don't set filesLoaded to true on error to allow retries
    } finally {
      setLoadingFiles(false);
    }
  };

  // Create new file objects using batch create
  const createNewFiles = async () => {
    if (!jobData || !jobData.api_files || jobData.api_files.length === 0) {
      console.log('createNewFiles: No job data or api_files found');
      return;
    }
    
    try {
      setLoadingFiles(true);
      setLoadingStep(2);
      setLoadingMessage('Creating file objects...');
      setLoadingDetail(`Setting up ${jobData.api_files.length} file entries`);
      
      console.log('Creating file objects for:', jobData.api_files);
      console.log('Job data:', { job_id: jobData.job_id, app_name: jobData.app_name });
      
      // Sanitize app name to ensure it's URL-safe and consistent with S3 paths
      const sanitizeAppName = (str: string) => str.trim().replace(/[^a-zA-Z0-9\-_]/g, '-').replace(/-+/g, '-');
      const sanitizedAppName = sanitizeAppName(jobData.app_name || '');
      
      console.log('Sanitized app name:', sanitizedAppName, 'from original:', jobData.app_name);
      
      // Get actual pending files to determine what files need to be created
      const pendingFiles = (window as any).pendingUploadFiles;
      const actualFiles = pendingFiles?.files || [];
      
      console.log('Actual files to be uploaded:', actualFiles.map((f: File) => f.name));
      
      // Create a mapping of actual file names to their base names (for grouping)
      // Only process files that match our strict naming convention
      const fileNameToBaseMap = new Map<string, string>();
      actualFiles.forEach((file: File) => {
        const fileName = file.name;
        // Only accept files ending with _FR.pdf or _BK.pdf (strict naming)
        if (fileName.match(/_(FR|BK)\.pdf$/i)) {
          const baseName = fileName.replace(/_(FR|BK)\.pdf$/i, '');
          fileNameToBaseMap.set(fileName, baseName);
        } else {
          console.warn(`⚠️ Skipping file with invalid naming: ${fileName} (must end with _FR.pdf or _BK.pdf)`);
        }
      });
      
      // Group files by their base names (only for valid files)
      const fileGroups = new Map<string, {name: string, type: 'front' | 'back'}[]>();
      actualFiles.forEach((file: File) => {
        const fileName = file.name;
        const baseName = fileNameToBaseMap.get(fileName);
        if (!baseName) return; // Skip files that don't match our naming convention
        
        // Determine card type based on strict filename convention
        let cardType: 'front' | 'back' = 'front';
        if (fileName.match(/_BK\.pdf$/i)) {
          cardType = 'back';
        } else if (fileName.match(/_FR\.pdf$/i)) {
          cardType = 'front';
        } else {
          // This shouldn't happen since we filtered above, but be safe
          console.warn(`⚠️ Unexpected filename pattern: ${fileName}`);
          return;
        }
        
        if (!fileGroups.has(baseName)) {
          fileGroups.set(baseName, []);
        }
        fileGroups.get(baseName)!.push({name: fileName, type: cardType});
      });
      
      console.log('File groups created:', Array.from(fileGroups.entries()));
      
      // Create file objects based on the actual files being uploaded
      const fileObjects: FileData[] = Array.from(fileGroups.entries()).map(([baseName, files]) => {
        const originalFiles: Record<string, {
          card_type: 'front' | 'back';
          file_path: string;
          status: 'uploading' | 'uploaded' | 'upload-failed';
        }> = {};
        
        // Add each actual file to the original_files object
        files.forEach(file => {
          originalFiles[file.name] = {
            card_type: file.type,
            file_path: `${sanitizedAppName}/PDFs/${file.name}`,
          status: 'uploading'
        };
        });
        
        return {
          filename: baseName,
          last_updated: new Date().toISOString(),
          original_files: originalFiles
        };
      });
      
      // Create FileData objects for the API with flattened structure
      const apiFileData: FileData[] = fileObjects.map(fileObj => ({
        filename: fileObj.filename,
        job_id: jobData.job_id,
        original_files: fileObj.original_files
      }));
      
      // Batch create files
      const batchResponse = await contentPipelineApi.batchCreateFiles(apiFileData);
      
      console.log('Batch create response:', batchResponse);
      
      // Handle the response - some files may already exist
      let finalFileObjects: FileData[] = [];
      
              // Add successfully created files
        if (batchResponse.created_files && batchResponse.created_files.length > 0) {
          console.log('✅ Successfully created files:', batchResponse.created_files.length);
        const createdFiles = batchResponse.created_files.map((apiFile: any) => ({
            filename: apiFile.filename,
            last_updated: apiFile.last_updated || new Date().toISOString(),
            original_files: apiFile.original_files || apiFile.metadata?.original_files || {},
            extracted_files: apiFile.extracted_files || apiFile.metadata?.extracted_files || {},
            firefly_assets: apiFile.firefly_assets || apiFile.metadata?.firefly_assets || {}
          }));
        finalFileObjects = [...finalFileObjects, ...createdFiles];
      }
      
      // Handle existing files returned by the API
      if (batchResponse.existing_files && batchResponse.existing_files.length > 0) {
        console.log('📁 Found existing files:', batchResponse.existing_files.length);
        const existingFiles = batchResponse.existing_files.map((apiFile: any) => ({
              filename: apiFile.filename,
              job_id: apiFile.job_id,
              last_updated: apiFile.last_updated || new Date().toISOString(),
          original_files: apiFile.original_files || apiFile.metadata?.original_files || {},
          extracted_files: apiFile.extracted_files || apiFile.metadata?.extracted_files || {},
          firefly_assets: apiFile.firefly_assets || apiFile.metadata?.firefly_assets || {}
            }));
        finalFileObjects = [...finalFileObjects, ...existingFiles];
        
        console.log('🔍 Existing files details:', existingFiles.map(f => ({
          filename: f.filename,
          hasOriginalFiles: Object.keys(f.original_files || {}).length > 0,
          hasExtractedFiles: Object.keys(f.extracted_files || {}).length > 0,
          hasFireflyAssets: Object.keys(f.firefly_assets || {}).length > 0
        })));
      }
      
      // Handle any failed files (log for debugging)
      if (batchResponse.failed_files && batchResponse.failed_files.length > 0) {
        console.warn('⚠️ Some files failed to create:', batchResponse.failed_files.length);
        console.warn('Failed files details:', batchResponse.failed_files);
        // Backend now handles existing files gracefully, so we just log any genuine failures
      }
      
      console.log('📁 Final file objects count:', finalFileObjects.length);
      
      // Only update if we actually got files back
      if (finalFileObjects.length > 0) {
        // Update React Query cache with all files (created + existing)
        const updatedJobData = {
          ...jobData,
          content_pipeline_files: finalFileObjects
        };
        
        console.log('Setting job data with file objects:', updatedJobData);
        console.log('🔄 Updating React Query cache from: createNewFiles at', new Date().toISOString());
        
        // Update React Query cache instead of legacy state
        queryClient.setQueryData(jobKeys.detail(jobData.job_id), updatedJobData);
        setFilesLoaded(true);
        
        // Verify the cache was updated
        const cachedData = queryClient.getQueryData<UIJobData>(jobKeys.detail(jobData.job_id));
        console.log('🔍 Cache verification after update:', {
          updatedFiles: finalFileObjects.length,
          cachedFiles: cachedData?.content_pipeline_files?.length || 0,
          cacheUpdateSuccessful: !!cachedData?.content_pipeline_files?.length,
          finalFileObjectsSample: finalFileObjects.slice(0, 2).map(f => ({
            filename: f.filename,
            hasOriginalFiles: Object.keys(f.original_files || {}).length > 0
          })),
          updatedJobDataStructure: Object.keys(updatedJobData)
        });
        
        // Set appropriate completion step and message based on what was found
        const isExtracted = jobData.job_status?.toLowerCase() === 'extracted';
        const createdCount = batchResponse.created_files?.length || 0;
        const existingCount = batchResponse.existing_files?.length || 0;
        
        let completionMessage = 'Files ready';
        if (createdCount > 0 && existingCount > 0) {
          completionMessage = `${createdCount} files created, ${existingCount} existing files loaded`;
        } else if (createdCount > 0) {
          completionMessage = `${createdCount} files created successfully`;
        } else if (existingCount > 0) {
          completionMessage = `${existingCount} existing files loaded`;
        }
        
        setLoadingStep(isExtracted ? 2 : 2); // Step 2 for file creation completion
        setLoadingMessage(isExtracted ? `${completionMessage} - Ready for PSD selection` : completionMessage);
        setLoadingDetail(`${finalFileObjects.length} files ready for upload`);
        
        console.log('createNewFiles completed successfully, filesLoaded set to true');
      } else {
        console.warn('⚠️ No files created, keeping existing state');
        setFilesLoaded(true); // Still mark as loaded to prevent retries
        
        const isExtracted = jobData.job_status?.toLowerCase() === 'extracted';
        setLoadingStep(isExtracted ? 2 : 2);
        setLoadingMessage(isExtracted ? 'Files ready - Ready for PSD selection' : 'Files ready');
        setLoadingDetail('No new files to create');
      }
      
    } catch (error) {
      console.error('Error creating file objects:', error);
      setError('Failed to create file objects: ' + (error as Error).message);
      // Don't set filesLoaded to true on error to allow retries
    } finally {
      setLoadingFiles(false);
    }
  };

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
      
      // Also update legacy state for backward compatibility
      setJobData(prevJobData => {
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



  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.editContainer}>
          <main className={styles.mainContent}>
            <div style={{
              maxWidth: 1200,
              width: '100%',
              background: 'rgba(255, 255, 255, 0.06)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 16,
              padding: 32,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
            }}>
              {/* Job Header Skeleton */}
              <JobHeaderSkeleton />
              
              {/* Loading Progress */}
              <LoadingProgress
                step={loadingStep}
                totalSteps={getTotalLoadingSteps()}
                message={loadingMessage}
                detail={loadingDetail}
              />
              
              {/* Files Section Skeleton */}
              <div style={{ marginTop: 32 }}>
                <div style={{
                  width: '200px',
                  height: 32,
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s infinite',
                  borderRadius: 8,
                  marginBottom: 24
                }} />
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {[0, 1].map((index) => (
                    <FileCardSkeleton key={index} index={index} />
                  ))}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.loading}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <h2>Error Loading Job Details</h2>
          <p>{error?.message || 'Unknown error occurred'}</p>
          <button 
            onClick={() => router.push('/jobs')}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer'
            }}
          >
            Back to Jobs
          </button>
        </div>
      </div>
    );
  }

  if (!mergedJobData) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.loading}>
          <h2>No Job Data Found</h2>
          <button 
            onClick={() => router.push('/jobs')}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer'
            }}
          >
            Back to Jobs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      
      {/* Upload Warning Banner */}
      {uploadsInProgress && (
        <div style={{
          position: 'fixed',
          top: 80, // Below the navbar
          left: 0,
          right: 0,
          background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.98), rgba(217, 119, 6, 0.98))', // Slightly more opaque to compensate
          color: 'white',
          padding: '12px 24px',
          textAlign: 'center',
          fontSize: 14,
          fontWeight: 500,
          zIndex: 100, // Lowered to allow browser dialogs above
          // Removed backdropFilter to prevent interference with native confirm dialogs
          border: '1px solid rgba(245, 158, 11, 0.3)',
          boxShadow: '0 4px 20px rgba(245, 158, 11, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span>
              Upload in progress ({uploadEngine.uploadedPdfFiles}/{uploadEngine.totalPdfFiles} files) - 
              Please don't close this tab or use the browser back button
            </span>
            <div style={{
              width: 16,
              height: 16,
              border: '2px solid rgba(255, 255, 255, 0.3)',
              borderTop: '2px solid white',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginLeft: 8
            }} />
          </div>
        </div>
      )}
      
      <div className={styles.editContainer} style={uploadsInProgress ? { paddingTop: '60px' } : {}}>
        <main className={styles.mainContent}>
          <div style={{
            maxWidth: 1200,
            width: '100%',
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 16,
            padding: 32,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            
            {/* Job Header - Now uses JobHeader component */}
            <JobHeader 
              jobData={mergedJobData}
              totalPdfFiles={uploadEngine.totalPdfFiles}
              uploadedPdfFiles={uploadEngine.uploadedPdfFiles}
              onRerunJob={mergedJobData && !uploadsInProgress ? () => {
                // Navigate to new job page with pre-filled data
                console.log('🔍 DEBUG Rerun Navigation - Job Data:', {
                  job_id: mergedJobData.job_id,
                  files: mergedJobData.files,
                  api_files: mergedJobData.api_files,
                  filesLength: mergedJobData.files?.length,
                  api_filesLength: mergedJobData.api_files?.length,
                  allJobDataKeys: Object.keys(mergedJobData),
                  // Check for other possible file field names
                  file_list: (mergedJobData as any).file_list,
                  file_names: (mergedJobData as any).file_names,
                  grouped_files: (mergedJobData as any).grouped_files,
                  filenames: (mergedJobData as any).filenames,
                  mergedJobData: mergedJobData
                });
                
                // Try multiple possible field names for files
                const filesArray = mergedJobData.files || 
                                  mergedJobData.api_files || 
                                  (mergedJobData as any).file_list ||
                                  (mergedJobData as any).file_names ||
                                  (mergedJobData as any).grouped_files ||
                                  (mergedJobData as any).filenames ||
                                  [];
                console.log('📁 Files array for rerun:', filesArray);
                
                const queryParams = new URLSearchParams({
                  rerun: 'true',
                  sourceJobId: mergedJobData.job_id || '',
                  appName: mergedJobData.app_name || '',
                  filenamePrefix: mergedJobData.filename_prefix || '',
                  description: mergedJobData.description || '',
                  sourceFolder: mergedJobData.source_folder || '',
                  // Include files array for rerun - essential for upload functionality
                  files: JSON.stringify(filesArray)
                });
                
                console.log('🔗 Navigation URL will be:', `/new-job?${queryParams.toString()}`);
                router.push(`/new-job?${queryParams.toString()}`);
              } : undefined}
            />



            {/* PSD Template Selector - Now uses PSDTemplateSelector component */}
            <PSDTemplateSelector
              jobData={jobData}
              mergedJobData={mergedJobData}
              isVisible={(mergedJobData?.job_status?.toLowerCase() === 'extracted' || mergedJobData?.job_status?.toLowerCase() === 'generation-failed') && !loading && !loadingFiles}
              creatingAssets={creatingAssets}
              setCreatingAssets={setCreatingAssets}
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
                  // Force a new object reference to trigger React re-render
                  _cacheTimestamp: Date.now()
                };
                
                console.log('🔄 Updating job data from PSDTemplateSelector:', {
                  previous: Object.keys(effectiveJobData?.assets || {}),
                  new: Object.keys(updatedJobData?.assets || {}),
                  jobId: updatedJobData?.job_id,
                  hasAssets: !!mappedJobData.assets,
                  assetsCount: mappedJobData.assets ? Object.keys(mappedJobData.assets).length : 0,
                  assetIds: mappedJobData.assets ? Object.keys(mappedJobData.assets) : []
                });
                
                // Update React Query cache
                if (jobData?.job_id) {
                  syncJobDataAcrossCaches(queryClient, jobData.job_id, () => mappedJobData);
                }
                
                // FORCE UI UPDATE: Update local state to ensure UI reflects new data immediately
                console.log('🚀 Setting local job data to force UI update');
                setLocalJobData(mappedJobData);
              }}
            />

            {/* Download Section - Shows when job is completed */}
            <DownloadSection
              jobData={mergedJobData}
              isVisible={(['complete', 'completed'].includes(mergedJobData?.job_status?.toLowerCase() || '') ||
                        (mergedJobData?.download_url && mergedJobData?.download_url_expires)) && 
                        !loading && !loadingFiles}
              onJobDataUpdate={(updatedJobData) => {
                // Update React Query cache with updated job data (e.g., new download URL or regenerated job status)
                updateJobDataForUpload((prevJobData) => {
                  console.log('🔄 Updating job data from DownloadSection:', {
                    previous: prevJobData?.job_status,
                    new: updatedJobData?.job_status,
                    jobId: updatedJobData?.job_id
                  });
                  
                  // Map API response to UIJobData format to preserve UI-specific fields
                  const mappedJobData = {
                    ...prevJobData, // Preserve existing UI fields (api_files, content_pipeline_files, etc.)
                    ...updatedJobData, // Overlay new server data (including updated download URLs, job status, etc.)
                    api_files: updatedJobData.files || prevJobData?.api_files || [],
                    Subset_name: updatedJobData.source_folder || prevJobData?.Subset_name
                  };
                  
                  return mappedJobData;
                });
              }}
            />

            {/* Files Section - Now uses FilesSection component */}
            {(() => {
              console.log('🔍 FilesSection Props Debug:', {
                mergedJobDataFiles: mergedJobData?.content_pipeline_files?.length || 0,
                jobDataFiles: jobData?.content_pipeline_files?.length || 0,
                uploadingFiles: uploadEngine.uploadingFiles?.size || 0,
                loadingFiles,
                filesLoaded,
                loadingStep,
                loadingMessage,
                uploadsStarted: uploadEngine.uploadStarted,
                totalPdfFiles: uploadEngine.totalPdfFiles,
                uploadedPdfFiles: uploadEngine.uploadedPdfFiles
              });
              return null;
            })()}
            <FilesSection
              mergedJobData={mergedJobData}
              jobData={jobData}
              uploadingFiles={uploadEngine.uploadingFiles}
              loadingFiles={loadingFiles}
              filesLoaded={filesLoaded}
              loadingStep={loadingStep}
              loadingMessage={loadingMessage}
              loadingDetail={loadingDetail}
            />

          </div>
        </main>
      </div>

      {/* Fullscreen Blocking Overlay for Asset Creation */}
      {creatingAssets && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)', // Slightly darker to compensate for removed blur
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000 // Lowered from 9999 to allow browser dialogs to show above
        }}>
          <div style={{
            backgroundColor: '#1f2937',
            borderRadius: 16,
            padding: 48,
            textAlign: 'center',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            maxWidth: 400,
            width: '90%'
          }}>
            {/* Spinning loader */}
            <div style={{
              width: 64,
              height: 64,
              border: '4px solid rgba(16, 185, 129, 0.2)',
              borderTop: '4px solid #10b981',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 24px auto'
            }} />
            
            <h2 style={{
              color: '#f8f8f8',
              fontSize: 24,
              fontWeight: 600,
              margin: '0 0 12px 0'
            }}>
              🎨 Creating Digital Assets
            </h2>
            
            <p style={{
              color: '#9ca3af',
              fontSize: 16,
              margin: '0 0 24px 0',
              lineHeight: 1.5
            }}>
              Processing your selected colors and layers...
            </p>
            
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: '#10b981',
              fontSize: 14
            }}>
              <div style={{
                width: 8,
                height: 8,
                backgroundColor: '#10b981',
                borderRadius: '50%',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
              <span>This may take a few moments...</span>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes shimmer {
          0% { 
            background-position: -200% 0; 
          }
          100% { 
            background-position: 200% 0; 
          }
        }
        
        @keyframes fadeIn {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes gradient-shift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        
        .uploading-text {
          animation: pulse 2s infinite;
        }
      `}</style>
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