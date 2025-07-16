'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import { 
  NavBar, 
  JobHeader, 
  PSDTemplateSelector, 
  FilesSection, 
  JobHeaderSkeleton, 
  LoadingProgress,
  FileCardSkeleton,
  FileCard 
} from '../../../components';
import { useFileUpload } from '../../../hooks';
import styles from '../../../styles/Edit.module.css';
import Spinner from '../../../components/Spinner';
import { contentPipelineApi, JobData, FileData } from '../../../web/utils/contentPipelineApi';
import { useJobData, useJobFiles, useUpdateJobStatus, createJobDataFromParams, UIJobData, jobKeys } from '../../../web/hooks/useJobData';
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
  const appName = searchParams.get('appName');
  const releaseName = searchParams.get('releaseName');
  const subsetName = searchParams.get('subsetName');
  const sourceFolder = searchParams.get('sourceFolder');
  const status = searchParams.get('status');
  const createdAt = searchParams.get('createdAt');
  const files = searchParams.get('files');
  const description = searchParams.get('description');
  const createFiles = searchParams.get('createFiles');
  
  // React Query hooks for smart caching
  const queryClient = useQueryClient();
  
  // Check if we have query params to pre-populate cache
  const hasQueryParams = !!(appName && releaseName && subsetName && sourceFolder && status);
  
  // Always use React Query caching - let it handle cached data automatically
  const { 
    data: jobData, 
    isLoading: isLoadingJob, 
    error: jobError,
    isFetching: isRefetchingJob 
  } = useJobData(jobId || null);
  
  // Debug logging for cache behavior
  useEffect(() => {
    console.log('🔍 React Query State:', {
      jobId,
      hasJobData: !!jobData,
      isLoading: isLoadingJob,
      isFetching: isRefetchingJob,
      hasError: !!jobError,
      source: jobData ? 'Cache/Fresh Data' : 'None',
      timestamp: new Date().toISOString()
    });
  }, [jobId, jobData, isLoadingJob, isRefetchingJob, jobError]);
  
  // Pre-populate cache with query params data if available (for instant display)
  useEffect(() => {
    if (hasQueryParams && jobId && !jobData) {
      const paramsData = createJobDataFromParams({
        jobId,
        appName: appName || undefined,
        releaseName: releaseName || undefined,
        subsetName: subsetName || undefined,
        sourceFolder: sourceFolder || undefined,
        status: status || undefined,
        createdAt: createdAt || undefined,
        files: files || undefined,
        description: description || undefined,
      });
      
      // Set the data in cache immediately (instant display)
      queryClient.setQueryData(['jobs', 'detail', jobId], paramsData);
      console.log('📋 Pre-populated cache with query params data for instant display');
    }
  }, [jobId, hasQueryParams, appName, releaseName, subsetName, sourceFolder, status, createdAt, files, description, queryClient, jobData]);
  
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
    error: filesError 
  } = useJobFiles(
    shouldFetchFiles ? (jobData?.job_id || null) : null, 
    shouldFetchFiles ? (jobData?.api_files || []) : [],
    shouldFetchFiles // Disable the hook when createFiles=true
  );
  
  // Merge cached job data with fresh file data
  const mergedJobData = jobData ? {
    ...jobData,
    // When createFiles='true', use files from jobData (set by createNewFiles)
    // When createFiles!='true', use fresh fileData from useJobFiles hook
    content_pipeline_files: createFiles === 'true' ? (jobData.content_pipeline_files || []) : fileData
  } : null;
  
  // Debug logging for file source
  console.log('🔍 mergedJobData file source:', {
    createFiles,
    usingJobDataFiles: createFiles === 'true',
    jobDataFilesCount: jobData?.content_pipeline_files?.length || 0,
    fileDataCount: fileData.length,
    finalCount: mergedJobData?.content_pipeline_files?.length || 0,
    jobDataExists: !!jobData,
    jobDataStructure: jobData ? Object.keys(jobData) : 'no jobData'
  });
  
  // Status update mutation
  const updateJobStatusMutation = useUpdateJobStatus();
  
  // Upload management with custom hook
  const uploadState = useFileUpload();
  
  // Legacy state for components that still need it
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

  // Legacy job loading useEffect removed - React Query handles this now
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
    uploadState.setUploadStarted(false);
    uploadState.setUploadProgress({});
    uploadState.setUploadingFiles(new Set());
    uploadState.setAllFilesUploaded(false);
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
      console.log('🔄 Auto-triggering file creation for createFiles=true');
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
    if (!filesLoaded || !jobData?.content_pipeline_files || uploadState.uploadStarted) {
      return;
    }

    console.log('✅ Files loaded, checking for uploads...');
    console.log('🔍 Checking for files that need uploading...');
    
    // Collect all files with "Uploading" status
    const filesToUpload: { filename: string; filePath: string }[] = [];
    
    jobData.content_pipeline_files.forEach(fileGroup => {
      if (fileGroup.original_files) {
        Object.entries(fileGroup.original_files).forEach(([filename, fileInfo]) => {
          if (fileInfo.status === 'uploading') {
            filesToUpload.push({
              filename: filename,
              filePath: fileInfo.file_path
            });
          }
        });
      }
    });

    if (filesToUpload.length === 0) {
      console.log('ℹ️ No files need uploading');
      return;
    }

    console.log(`📁 Found ${filesToUpload.length} files that need uploading:`, filesToUpload.map(f => f.filename));

    // Check if we have actual File objects (for new jobs)
    const pendingFiles = (window as any).pendingUploadFiles;
    if (pendingFiles && pendingFiles.jobId === jobData.job_id && pendingFiles.files) {
      console.log('🚀 Starting upload with files from new job creation...');
      
      // Filter the pending files to only upload what's needed
      const matchedFiles = pendingFiles.files.filter((file: File) =>
        filesToUpload.some(needed => needed.filename === file.name)
      );
      
      if (matchedFiles.length > 0) {
        console.log('Starting upload for:', matchedFiles.map((f: File) => f.name));
        
        // Set flag to prevent re-triggering
        uploadState.setUploadStarted(true);
        
        // Start upload process (defined below)
        const doUpload = async () => {
          try {
            await startUploadProcess(matchedFiles);
          } catch (error) {
            console.error('Upload process failed:', error);
          }
        };
        
        doUpload();
      }
    } else {
      console.log('⚠️ Files need uploading but no File objects available');
      console.log('📋 Required files:', filesToUpload.map(f => f.filename));
      console.log('ℹ️ User will need to upload these files manually');
    }
  }, [filesLoaded, uploadState.uploadStarted]);

  // (Reset logic moved to dedicated useEffect above)

  // Monitor upload completion - simplified and reliable
  useEffect(() => {
    if (!jobData?.content_pipeline_files || uploadState.allFilesUploaded) {
      return;
    }

    const checkUploadStatus = () => {
      // Simple completion logic using our tracking variables
      const allFilesProcessed = uploadState.totalPdfFiles > 0 && (uploadState.uploadedPdfFiles + uploadState.failedPdfFiles) === uploadState.totalPdfFiles;
      const noActiveUploads = uploadState.uploadingFiles.size === 0;
      const hasUploads = uploadState.uploadedPdfFiles > 0;
      const isComplete = allFilesProcessed && noActiveUploads && hasUploads;
      
      console.log('📊 Upload status check:', uploadState.uploadedPdfFiles + '/' + uploadState.totalPdfFiles, 'uploaded,', uploadState.failedPdfFiles, 'failed, activeUploads:', uploadState.uploadingFiles.size);
      
      console.log(`🔍 Completion check:`, {
        totalPdfFiles: uploadState.totalPdfFiles,
        uploadedPdfFiles: uploadState.uploadedPdfFiles,
        failedPdfFiles: uploadState.failedPdfFiles,
        activeUploads: uploadState.uploadingFiles.size,
        allFilesProcessed,
        noActiveUploads,
        hasUploads,
        isComplete,
        willNavigate: isComplete && !uploadState.allFilesUploaded
      });
      
      // Navigate when upload is truly complete
      if (isComplete && !uploadState.allFilesUploaded) {
        console.log('✅ Upload completed! Navigating to jobs list...');
        console.log('📋 Final status:', uploadState.uploadedPdfFiles + '/' + uploadState.totalPdfFiles, 'uploaded,', uploadState.failedPdfFiles, 'failed');
        uploadState.setAllFilesUploaded(true);
        
        // Navigate to jobs list after short delay
        setTimeout(() => {
          console.log('🚀 Navigating to jobs list...');
          router.push('/jobs');
        }, 1500);
      }
    };

    // Check immediately
    checkUploadStatus();

    // Set up interval to check every 500ms for responsiveness
    const interval = setInterval(checkUploadStatus, 500);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [jobData?.content_pipeline_files, uploadState.uploadingFiles, uploadState.allFilesUploaded, router]);

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

  // Load job details from query parameters (to avoid API call)
  const loadJobDetailsFromParams = async () => {
    try {
      setLoading(true);
      setLoadingStep(1);
      setLoadingMessage('Loading job details...');
      setLoadingDetail('Parsing job parameters');
      
      // Reset file-related state when loading a new job
      setFilesLoaded(false);
      setLoadingFiles(false);
      
      console.log('Loading job details from query params (avoiding API call)');
      
      // Parse files from query params
      let parsedFiles: string[] = [];
      try {
        parsedFiles = files ? JSON.parse(files as string) : [];
      } catch (e) {
        console.warn('Failed to parse files from query params:', e);
      }
      
      // Create job data from query parameters, preserving existing files
      setJobData(prevJobData => {
        const mappedJobData: UIJobData = {
          job_id: jobId as string,
          app_name: appName as string,
          release_name: releaseName as string,
          subset_name: subsetName as string,
          source_folder: sourceFolder as string,
          job_status: status as JobData['job_status'],
          created_at: createdAt as string,
          description: description as string,
          api_files: parsedFiles,
          files: prevJobData?.files || [], // Preserve existing legacy files
          content_pipeline_files: prevJobData?.content_pipeline_files || [], // Preserve existing Content Pipeline files
          Subset_name: subsetName as string // Map subsetName to Subset_name for UI compatibility
        };
        
        console.log('🔄 setJobData called from: loadJobDetailsFromParams (preserving existing files) at', new Date().toISOString());
        console.log('📊 Preserved files:', mappedJobData.content_pipeline_files?.length || 0);
        return mappedJobData;
      });
      
    } catch (error) {
      console.error('Error loading job details from params:', error);
      setError('Failed to load job details: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

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
          Subset_name: response.job.subset_name || response.job.source_folder // Map subset_name to Subset_name for UI compatibility
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
      const fileNameToBaseMap = new Map<string, string>();
      actualFiles.forEach((file: File) => {
        const fileName = file.name;
        // Extract base name by removing _FR.pdf, _BK.pdf, etc.
        const baseName = fileName.replace(/_(FR|BK|FRONT|BACK)\.pdf$/i, '');
        fileNameToBaseMap.set(fileName, baseName);
      });
      
      // Group files by their base names
      const fileGroups = new Map<string, {name: string, type: 'front' | 'back'}[]>();
      actualFiles.forEach((file: File) => {
        const fileName = file.name;
        const baseName = fileNameToBaseMap.get(fileName);
        if (!baseName) return;
        
        // Determine card type based on filename
        let cardType: 'front' | 'back' = 'front';
        if (fileName.match(/_(BK|BACK)\.pdf$/i)) {
          cardType = 'back';
        } else if (fileName.match(/_(FR|FRONT)\.pdf$/i)) {
          cardType = 'front';
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
          finalFileObjects = batchResponse.created_files.map((apiFile: any) => ({
            filename: apiFile.filename,
            last_updated: apiFile.last_updated || new Date().toISOString(),
            original_files: apiFile.original_files || apiFile.metadata?.original_files || {},
            extracted_files: apiFile.extracted_files || apiFile.metadata?.extracted_files || {},
            firefly_assets: apiFile.firefly_assets || apiFile.metadata?.firefly_assets || {}
          }));
        }
      
      // Handle failed files - check if they already exist
      if (batchResponse.failed_files && batchResponse.failed_files.length > 0) {
        console.log('⚠️ Some files failed to create:', batchResponse.failed_files.length);
        
        // Separate files that already exist from other errors
        const alreadyExistFiles = batchResponse.failed_files.filter((failedFile: any) => 
          failedFile.error && failedFile.error.includes('already exists')
        );
        
        const otherErrors = batchResponse.failed_files.filter((failedFile: any) => 
          !failedFile.error || !failedFile.error.includes('already exists')
        );
        
        if (otherErrors.length > 0) {
          console.error('❌ Files with non-recoverable errors:', otherErrors);
          // Continue processing but log the errors
        }
        
        if (alreadyExistFiles.length > 0) {
          console.log('🔄 Files already exist, loading existing files:', alreadyExistFiles.map((f: any) => f.file_data.filename));
          
          // Load existing files using batch read
          const existingFilenames = alreadyExistFiles.map((f: any) => f.file_data.filename);
          try {
            const existingFilesResponse = await contentPipelineApi.batchGetFiles(existingFilenames);
            
            console.log('✅ Loaded existing files:', existingFilesResponse.files.length);
            
            // Add existing files to our final list
            const existingFileObjects = existingFilesResponse.files.map((apiFile: FileData) => ({
              filename: apiFile.filename,
              job_id: apiFile.job_id,
              last_updated: apiFile.last_updated || new Date().toISOString(),
              original_files: apiFile.original_files || {},
              extracted_files: apiFile.extracted_files || {},
              firefly_assets: apiFile.firefly_assets || {}
            }));
            
            finalFileObjects = [...finalFileObjects, ...existingFileObjects];
            
          } catch (loadError) {
            console.error('❌ Error loading existing files:', loadError);
            // If we can't load existing files, create them manually from our local data
            const manualFileObjects = alreadyExistFiles.map((failedFile: any) => {
              const originalFileData = fileObjects.find(f => f.filename === failedFile.file_data.filename);
              return originalFileData || {
                filename: failedFile.file_data.filename,
                job_id: failedFile.file_data.job_id,
                last_updated: failedFile.file_data.last_updated || new Date().toISOString(),
                original_files: failedFile.file_data.original_files || {},
                extracted_files: failedFile.file_data.extracted_files || {},
                firefly_assets: failedFile.file_data.firefly_assets || {}
              };
            });
            
            finalFileObjects = [...finalFileObjects, ...manualFileObjects];
          }
        }
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
          cacheUpdateSuccessful: !!cachedData?.content_pipeline_files?.length
        });
        
        // Set appropriate completion step based on job status
        const isExtracted = jobData.job_status?.toLowerCase() === 'extracted';
        setLoadingStep(isExtracted ? 2 : 2); // Step 2 for file creation completion
        setLoadingMessage(isExtracted ? 'Files created - Ready for PSD selection' : 'File objects created');
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

    // Update job status using Content Pipeline API
  const updateJobStatus = async (status: JobData['job_status']): Promise<void> => {
    if (!jobData?.job_id) return;
    
    try {
      console.log('Updating job status:', { status });
      const response = await contentPipelineApi.updateJobStatus(
        jobData.job_id,
        status
      );
      
      console.log('Job status updated successfully:', response.job);
      
      // Use functional update to preserve current file statuses
      console.log('🔄 setJobData called from: updateJobStatus (preserving file statuses) at', new Date().toISOString());
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
    } catch (error) {
      console.error('Error updating job status:', error);
      throw error;
    }
  };

  // Get pre-signed URL for uploading files
  const getPresignedUrl = async (filePath: string): Promise<string> => {
    try {
      console.log('🔗 Getting presigned URL for:', filePath);
      
      const requestBody = { 
        filename: filePath,
        client_method: 'put',
        expires_in: 720
      };
      
      console.log('📤 Request body:', requestBody);
      
      const response = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      console.log('📥 Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Error response:', errorData);
        throw new Error(`Failed to get pre-signed URL: ${response.statusText} - ${JSON.stringify(errorData)}`);
      }
      
      const data = await response.json();
      console.log('✅ Got presigned URL response:', data);
      return data.url;
    } catch (error) {
      console.error('❌ Error getting pre-signed URL:', error);
      throw error;
    }
  };

  // Upload file using pre-signed URL by proxying through our backend
  const uploadFileToS3 = async (file: File, uploadUrl: string, onProgress?: (progress: number) => void): Promise<void> => {
    try {
      console.log('📤 Starting proxied upload for:', file.name, 'to /api/s3-upload');

      const response = await fetch('/api/s3-upload', {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/pdf',
          'x-presigned-url': uploadUrl, // Pass the presigned URL in a header
        },
        body: file,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMsg = `Upload failed with status ${response.status}: ${errorText}`;
        console.error('❌', errorMsg);
        throw new Error(errorMsg);
      }

      console.log('✅ Proxied upload completed for', file.name, ', status:', response.status);
      onProgress?.(100);
    } catch (error) {
      console.error(`❌ Proxied upload failed for ${file.name}:`, error);
      throw error;
    }
  };

  // Update file status using backend response as single source of truth
  const updateFileStatus = async (
    groupFilename: string,
    pdfFilename: string,
    status: 'uploading' | 'uploaded' | 'upload-failed'
  ): Promise<void> => {
    if (!jobData?.content_pipeline_files) return;

    console.log('🔄 Updating status for', pdfFilename, 'in group', groupFilename, 'to', status);

    try {
      console.log(`📡 Calling backend API: updatePdfFileStatus(${groupFilename}, ${pdfFilename}, ${status})`);

      // Update backend first - this is our single source of truth
      const response = await contentPipelineApi.updatePdfFileStatus(groupFilename, pdfFilename, status);

      console.log(`✅ Backend API response for ${pdfFilename}:`, JSON.stringify(response, null, 2));

      // Check response structure in detail
      if (!response) {
        console.error('❌ Backend returned null/undefined response');
        throw new Error('Backend returned null response');
      }

      if (!response.file) {
        console.error('❌ Backend response missing "file" property:', response);
        throw new Error('Backend response missing file property');
      }

      if (!response.file.original_files) {
        console.error('❌ Backend response missing "original_files" property:', response.file);
        throw new Error('Backend response missing original_files property');
      }

      // Log the specific file status we're looking for
      const fileStatus = response.file.original_files[pdfFilename];
      console.log(`📋 Backend says ${pdfFilename} status is:`, fileStatus);

      // ONLY update local state with the response from backend (no optimistic updates)
      console.log(`🔄 Updating local state with backend response for ${groupFilename}`);
      
      setJobData(prev => {
        if (!prev?.content_pipeline_files) {
          console.warn('⚠️ No content_pipeline_files in previous state');
          return prev;
        }
        
        const beforeUpdate = prev.content_pipeline_files.find(f => f.filename === groupFilename);
        console.log(`📊 Before update - ${groupFilename} original_files:`, beforeUpdate?.original_files);
        
        const updatedFiles = prev.content_pipeline_files.map(file =>
          file.filename === groupFilename
            ? {
                ...file,
                original_files: response.file.original_files,
                extracted_files: response.file.extracted_files || file.extracted_files,
                firefly_assets: response.file.firefly_assets || file.firefly_assets,
                last_updated: new Date().toISOString()
              }
            : file
        );
        
        const afterUpdate = updatedFiles.find(f => f.filename === groupFilename);
        console.log(`📊 After update - ${groupFilename} original_files:`, afterUpdate?.original_files);
        
        return { ...prev, content_pipeline_files: updatedFiles };
      });
      
      console.log('✅ Local state synced with backend response for', groupFilename);
      
    } catch (error) {
      console.error(`❌ Failed to update ${pdfFilename} status in backend:`, error);
      // Do NOT update local state if backend update failed
      // This keeps files in their previous known good state
      throw error; // Re-throw so caller knows the update failed
    }
  };

  // Helper function to wait for a specified time
  const wait = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  // Simplified local file status update (optimistic UI update)
  const updateLocalFileStatus = (
    groupFilename: string,
    pdfFilename: string,
    status: 'uploading' | 'uploaded' | 'upload-failed'
  ): void => {
    console.log('📱 Updating local file status:', pdfFilename, 'to', status);
    
    setJobData(prev => {
      if (!prev?.content_pipeline_files) {
        console.warn('⚠️ No content_pipeline_files in previous state');
        return prev;
      }
      
      const updatedFiles = prev.content_pipeline_files.map(file =>
        file.filename === groupFilename
          ? {
              ...file,
              original_files: {
                ...file.original_files,
                [pdfFilename]: {
                  ...file.original_files?.[pdfFilename],
                  status: status
                }
              },
              last_updated: new Date().toISOString()
            }
          : file
      );
      
      return { ...prev, content_pipeline_files: updatedFiles };
    });
    
    // Update counters based on status
    if (status === 'uploaded') {
      uploadState.setUploadedPdfFiles(prev => prev + 1);
      console.log('✅ PDF uploaded successfully:', pdfFilename, '- Total uploaded:', uploadState.uploadedPdfFiles + 1);
    } else if (status === 'upload-failed') {
      uploadState.setFailedPdfFiles(prev => prev + 1);
      console.log('❌ PDF upload failed:', pdfFilename, '- Total failed:', uploadState.failedPdfFiles + 1);
    }
  };

  // Debug function to check current file states (call from browser console)
  const debugFileStates = () => {
    console.log('🔍 DEBUG: Current job data:', jobData);
    console.log('🔍 DEBUG: Upload progress:', uploadState.uploadProgress);
    console.log('🔍 DEBUG: Uploading files set:', Array.from(uploadState.uploadingFiles));
    console.log('🔍 DEBUG: All files uploaded flag:', uploadState.allFilesUploaded);
    
    if (jobData?.content_pipeline_files) {
      jobData.content_pipeline_files.forEach(fileGroup => {
        console.log(`📁 File group: ${fileGroup.filename}`);
        if (fileGroup.original_files) {
          Object.entries(fileGroup.original_files).forEach(([filename, fileInfo]) => {
            console.log(`  📄 ${filename}: ${fileInfo.status} (${fileInfo.card_type})`);
          });
        }
      });
    }
  };

  // Make debug function available globally for console access
  if (typeof window !== 'undefined') {
    (window as any).debugFileStates = debugFileStates;
  }

  // Upload a single file with retry logic and improved tracking
  const uploadSingleFile = async (groupFilename: string, filename: string, file: File, fileInfo: any, maxRetries: number = 3): Promise<void> => {
    let retryCount = 0;
    
    // Track this file as actively uploading (for UI progress)
    uploadState.setUploadingFiles(prev => {
      const newSet = new Set(prev).add(filename);
      console.log(`📤 Added ${filename} to uploadingFiles set. Current files:`, Array.from(newSet));
      return newSet;
    });
    
    // Set initial uploading status
    updateLocalFileStatus(groupFilename, filename, 'uploading');
    
    while (retryCount < maxRetries) {
      try {
        console.log('🔄 Uploading', filename, '(attempt', retryCount + 1 + '/' + maxRetries + ')');
        console.log('📁 File path:', fileInfo.file_path);
        
        // Get pre-signed URL
        const uploadUrl = await getPresignedUrl(fileInfo.file_path);
        
        // Upload file with progress tracking
        await uploadFileToS3(file, uploadUrl, (progress) => {
          uploadState.setUploadProgress(prev => ({
            ...prev,
            [filename]: progress
          }));
        });
        
        // File uploaded successfully - update local status immediately
        console.log(`✅ File ${filename} successfully uploaded to S3`);
        updateLocalFileStatus(groupFilename, filename, 'uploaded');

        // Clear upload progress for this file
        uploadState.setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[filename];
          console.log('🧹 Cleared upload progress for', filename);
          return newProgress;
        });
        
        // Remove from uploading set immediately (S3 upload completed)
        uploadState.setUploadingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(filename);
          console.log(`🗑️ Removed ${filename} from uploadingFiles set. Remaining files:`, Array.from(newSet));
          console.log(`📊 Upload completion check: ${filename} finished, ${newSet.size} files still uploading`);
          return newSet;
        });
        
        return; // Success, exit the retry loop
        
      } catch (error) {
        retryCount++;
        console.error(`Failed to upload ${filename} (attempt ${retryCount}/${maxRetries}):`, error);
        
        if (retryCount < maxRetries) {
          console.log(`Retrying upload of ${filename} in 1.5 seconds...`);
          // Keep status as uploading for retry
          await wait(1500);
        } else {
          // All retries failed - mark as failed
          console.error('All retry attempts failed for', filename);
          updateLocalFileStatus(groupFilename, filename, 'upload-failed');
          
          // Remove from uploading set on final failure
          uploadState.setUploadingFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(filename);
            console.log(`❌ Removed failed ${filename} from uploadingFiles set. Remaining files:`, Array.from(newSet));
            console.log(`📊 Upload completion check: ${filename} failed, ${newSet.size} files still uploading`);
            return newSet;
          });
          
          throw error; // Re-throw to let the caller handle the final failure
        }
      }
    }
  };

  // Start the upload process for all files (parallel batches of 4)
  const startUploadProcess = async (files: File[]): Promise<void> => {
    if (!jobData?.content_pipeline_files) {
      console.log('startUploadProcess: No content_pipeline_files found');
      return;
    }
    
    console.log('🚀 Starting simplified upload process (4 files at a time) for files:', files.map(f => f.name));
    
    // Create a mapping of file names to File objects
    const fileMap = new Map<string, File>();
    files.forEach(file => {
      fileMap.set(file.name, file);
    });
    
    // Collect all files to upload and calculate total
    const filesToUpload: Array<{groupFilename: string, filename: string, file: File, fileInfo: any}> = [];
    
    jobData.content_pipeline_files.forEach((fileObj) => {
      if (fileObj.original_files) {
        Object.entries(fileObj.original_files).forEach(([filename, fileInfo]) => {
          const file = fileMap.get(filename);
          if (file) {
            filesToUpload.push({ groupFilename: fileObj.filename, filename, file, fileInfo });
          } else {
            console.warn(`❌ File ${filename} not found in uploaded files`);
          }
        });
      }
    });
    
    // Set total PDF files and reset counters
    const totalFiles = filesToUpload.length;
    console.log('📊 Total PDF files to upload:', totalFiles);
    uploadState.setTotalPdfFiles(totalFiles);
    uploadState.setUploadedPdfFiles(0);
    uploadState.setFailedPdfFiles(0);
    
    const batchSize = 4; // Upload 4 files at a time
    
    // Process files in batches of 4
    for (let i = 0; i < filesToUpload.length; i += batchSize) {
      const batch = filesToUpload.slice(i, i + batchSize);
      console.log('📦 Processing batch', Math.floor(i / batchSize) + 1 + '/' + Math.ceil(filesToUpload.length / batchSize) + ':', batch.map(b => b.filename).join(', '));
      
      // Upload files in current batch in parallel
      const batchPromises = batch.map(async ({ groupFilename, filename, file, fileInfo }) => {
        try {
          await uploadSingleFile(groupFilename, filename, file, fileInfo);
          return { success: true, filename };
        } catch (error) {
          console.error(`Failed to upload ${filename} after all retries:`, error);
          return { success: false, filename };
        }
      });
      
      // Wait for all files in the batch to complete
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Log batch completion
      const batchSuccessCount = batchResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
      console.log('✅ Batch completed:', batchSuccessCount + '/' + batch.length, 'files uploaded successfully');
      
      // Small delay between batches to avoid overwhelming the server
      if (i + batchSize < filesToUpload.length) {
        await wait(300);
      }
    }
    
    console.log('🎉 Upload process completed! Total files:', totalFiles, 'Uploaded:', uploadState.uploadedPdfFiles, 'Failed:', uploadState.failedPdfFiles);
  };



  // Utility functions now imported from utils/fileOperations.ts

  if (loading) {
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
        <NavBar
          showHome
          showBackToEdit
          onHome={() => router.push('/')}
          onBackToEdit={() => router.push('/jobs')}
          backLabel="Back to Jobs"
          title="Job Details"
        />
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
      <NavBar
        showHome
        showBackToEdit
        onHome={() => router.push('/')}
        onBackToEdit={() => router.push('/jobs')}
        backLabel="Back to Jobs"
        title={getJobTitle(mergedJobData)}
      />
      
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
            
            {/* Job Header - Now uses JobHeader component */}
            <JobHeader 
              jobData={mergedJobData}
              totalPdfFiles={uploadState.totalPdfFiles}
              uploadedPdfFiles={uploadState.uploadedPdfFiles}
            />



            {/* PSD Template Selector - Now uses PSDTemplateSelector component */}
            <PSDTemplateSelector
              jobData={jobData}
              mergedJobData={mergedJobData}
              isVisible={mergedJobData?.job_status?.toLowerCase() === 'extracted' && !loading && !loadingFiles}
            />



                                                      

            {/* Files Section - Now uses FilesSection component */}
            <FilesSection
              mergedJobData={mergedJobData}
              jobData={jobData}
              uploadingFiles={uploadState.uploadingFiles}
              loadingFiles={loadingFiles}
              filesLoaded={filesLoaded}
              loadingStep={loadingStep}
              loadingMessage={loadingMessage}
              loadingDetail={loadingDetail}
            />

          </div>
        </main>
      </div>

      {/* Blocking Loading Overlay for Asset Creation */}
      {creatingAssets && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(4px)'
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
                animation: 'pulse 1.5s infinite'
              }} />
              <span>This may take a few moments</span>
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