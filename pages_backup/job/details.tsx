import { useRouter } from 'next/router';
import { useEffect, useState, useCallback } from 'react';
import NavBar from '../../components/NavBar';
import styles from '../../styles/Edit.module.css';
import Spinner from '../../components/Spinner';
import { contentPipelineApi, JobData, FileData } from '../../web/utils/contentPipelineApi';

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

// Extend the API JobData interface with UI-specific fields for backward compatibility
interface UIJobData extends JobData {
  // Legacy UI fields for backward compatibility
  psd_file?: string;
  template?: string;
  total_files?: number;
  timestamp?: string;
  Subset_name?: string;
  job_path?: string;
  
  // API files as separate property
  api_files?: string[];
  content_pipeline_files?: FileData[];
}

export default function JobDetailsPage() {
  const router = useRouter();
  const { jobId, startUpload, appName, releaseName, subsetName, sourceFolder, status, createdAt, files, description, createFiles } = router.query;
  
  const [jobData, setJobData] = useState<UIJobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [uploadStarted, setUploadStarted] = useState(false);
  const [physicalJsonFiles, setPhysicalJsonFiles] = useState<Array<{name: string; lastModified: string | null}>>([]);
  const [loadingPhysicalFiles, setLoadingPhysicalFiles] = useState(false);
  const [selectedPhysicalFile, setSelectedPhysicalFile] = useState<string>('');
  const [jsonData, setJsonData] = useState<any>(null);
  const [loadingJsonData, setLoadingJsonData] = useState(false);
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(new Set());
  const [selectedExtractedLayers, setSelectedExtractedLayers] = useState<Set<string>>(new Set());
  const [creatingAssets, setCreatingAssets] = useState(false);
  const [allFilesUploaded, setAllFilesUploaded] = useState(false);

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
      
      // Check if we have job data from query params to avoid API call
      if (appName && releaseName && subsetName && sourceFolder && status) {
        loadJobDetailsFromParams();
      } else {
        loadJobDetails();
      }
    }
  }, [jobId, appName, releaseName, subsetName, sourceFolder, status]);

  // Load file objects after job details are loaded
  useEffect(() => {
    console.log('🔄 useEffect[jobData, filesLoaded] triggered at', new Date().toISOString(), ':', { 
      hasJobData: !!jobData, 
      hasApiFiles: !!jobData?.api_files?.length, 
      filesLoaded, 
      jobStatus: jobData?.job_status,
      uploadStarted,
      hasContentPipelineFiles: !!jobData?.content_pipeline_files?.length
    });
    
    // Don't reload files if upload has started - this prevents overwriting status updates
    if (uploadStarted) {
      console.log('🔄 Skipping file loading - upload in progress, avoiding status overwrites');
      return;
    }
    
    // Don't reload files if they're already loaded and we have content_pipeline_files
    if (filesLoaded && jobData?.content_pipeline_files?.length > 0) {
      console.log('🔄 Skipping file loading - files already loaded and present');
      return;
    }
    
    if (jobData && jobData.api_files && jobData.api_files.length > 0 && !filesLoaded) {
      console.log('🔄 Loading files - condition met');
      if (createFiles === 'true') {
        // Create new file objects for jobs that need file creation
        console.log('🔄 Calling createNewFiles (createFiles=true)');
        createNewFiles();
      } else {
        // Load existing file objects for jobs that already have them
        console.log('🔄 Calling loadExistingFiles (createFiles=false or not set)');
        loadExistingFiles();
      }
    } else {
      console.log('🔄 Skipping file loading - condition not met');
    }
  }, [jobData?.job_id, jobData?.api_files?.length, filesLoaded, uploadStarted, createFiles]);

  // Reset file loading state when job ID changes (navigation to different job)
  useEffect(() => {
    console.log('🔄 Job ID changed, resetting file loading state');
    setFilesLoaded(false);
    setLoadingFiles(false);
    setUploadStarted(false);
    setUploadProgress({});
    setUploadingFiles(new Set());
    setAllFilesUploaded(false);
  }, [jobData?.job_id]);

  // Trigger upload check when files are loaded
  useEffect(() => {
    if (!filesLoaded || !jobData?.content_pipeline_files || uploadStarted) {
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
        setUploadStarted(true);
        
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
  }, [filesLoaded, uploadStarted]);

  // (Reset logic moved to dedicated useEffect above)

  // Monitor upload completion - runs every 1 second to check status
  useEffect(() => {
    if (!jobData?.content_pipeline_files) {
      return;
    }

    const checkUploadStatus = () => {
      // Check if all files have been uploaded
      let totalFiles = 0;
      let uploadedFiles = 0;
      let uploadingFilesCount = 0;
      let failedFiles = 0;
      
      jobData.content_pipeline_files.forEach(fileGroup => {
        if (fileGroup.original_files) {
          Object.values(fileGroup.original_files).forEach(fileInfo => {
            totalFiles++;
            if (fileInfo.status === 'uploaded') {
              uploadedFiles++;
            } else if (fileInfo.status === 'uploading') {
              uploadingFilesCount++;
            } else if (fileInfo.status === 'upload-failed') {
              failedFiles++;
            }
          });
        }
      });

      console.log(`📊 Upload status check: ${uploadedFiles}/${totalFiles} uploaded, ${uploadingFilesCount} uploading, ${failedFiles} failed, uploadingFiles.size: ${uploadingFiles.size}, allFilesUploaded: ${allFilesUploaded}`);

      // Check if all files are uploaded and no files are currently uploading
      // OR if upload process has finished (no uploading files) and we have uploaded at least some files
      const allUploaded = totalFiles > 0 && uploadedFiles === totalFiles && uploadingFiles.size === 0;
      const uploadProcessComplete = totalFiles > 0 && uploadingFiles.size === 0 && uploadingFilesCount === 0 && uploadedFiles > 0;
      
      // Enhanced debugging for auto-navigate conditions
      console.log(`🔍 Auto-navigate conditions:`, {
        totalFiles,
        uploadedFiles,
        uploadingFilesCount,
        uploadingFilesSize: uploadingFiles.size,
        allFilesUploaded,
        allUploaded,
        uploadProcessComplete,
        condition1: allUploaded && !allFilesUploaded,
        condition2: uploadProcessComplete && !allFilesUploaded,
        willTrigger: (allUploaded || uploadProcessComplete) && !allFilesUploaded
      });
      
      if ((allUploaded || uploadProcessComplete) && !allFilesUploaded) {
        console.log('✅ Upload process completed! Auto-navigating to jobs list in 1 second...');
        console.log(`📋 Final status: ${uploadedFiles}/${totalFiles} uploaded, allUploaded: ${allUploaded}, uploadProcessComplete: ${uploadProcessComplete}`);
        setAllFilesUploaded(true);
        
        // Auto-navigate to jobs list after a short delay
        setTimeout(() => {
          console.log('🚀 Auto-navigating to jobs list now...');
          router.push('/jobs');
        }, 1000); // 1 second delay to let user see the final upload status
      }
    };

    // Check immediately
    checkUploadStatus();

    // Set up interval to check every 500ms (faster checking)
    const interval = setInterval(checkUploadStatus, 500);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [jobData?.content_pipeline_files, uploadingFiles, allFilesUploaded, router]);

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
      console.log('🔍 Fetching physical JSON files from S3...');
      
      const response = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          client_method: 'list'
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch JSON files: ${response.status}`);
      }

      const data = await response.json();
      console.log('📁 All files:', data.files);
      
      // Filter files that contain "physical" in the name and are JSON files
      const physicalFiles = data.files.filter((file: {name: string; lastModified: string | null}) => 
        file.name.toLowerCase().includes('physical') && file.name.toLowerCase().endsWith('.json')
      );
      
      console.log('🎯 Filtered physical JSON files:', physicalFiles);
      setPhysicalJsonFiles(physicalFiles);
      
    } catch (error) {
      console.error('❌ Error fetching physical JSON files:', error);
    } finally {
      setLoadingPhysicalFiles(false);
    }
  };

  // Function to construct S3 URL for JSON file
  const constructJsonUrl = (filename: string): string => {
    const baseUrl = 'https://topps-nexus-powertools.s3.us-east-1.amazonaws.com/asset_generator/dev/public/';
    const filenameWithoutExtension = filename.replace('.json', '');
    return `${baseUrl}${filenameWithoutExtension}/${filename}`;
  };

  // Function to download and parse JSON file via S3 proxy (to avoid CORS)
  const downloadJsonFile = async (filename: string) => {
    try {
      setLoadingJsonData(true);
      setJsonData(null);
      
      console.log('🔍 Downloading JSON via S3 proxy:', filename);
      
      // Use S3 proxy to avoid CORS issues
      const response = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          client_method: 'get',
          filename: filename,
          download: true  // This tells the proxy to fetch and return the content directly
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download JSON via proxy: ${response.status}`);
      }
      
      const proxyData = await response.json();
      console.log('📋 S3 proxy response received');
      
      // With download=true, the S3 proxy returns the JSON content directly
      if (proxyData && typeof proxyData === 'object') {
        console.log('📋 JSON data loaded successfully');
        setJsonData(proxyData);
      } else {
        throw new Error('Invalid JSON content received from S3 proxy');
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
      const filename = selectedPhysicalFile.split('/').pop() || selectedPhysicalFile;
      downloadJsonFile(filename);
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
          filename_prefix: releaseName as string, // Map releaseName to filename_prefix
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
      } else {
        console.warn('⚠️ No files returned from API, keeping existing state');
        setFilesLoaded(true); // Still mark as loaded to prevent retries
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
        // Update job data with all files (created + existing)
        const updatedJobData = {
          ...jobData,
          content_pipeline_files: finalFileObjects
        };
        
        console.log('Setting job data with file objects:', updatedJobData);
        console.log('🔄 setJobData called from: createNewFiles at', new Date().toISOString());
        setJobData(updatedJobData);
        setFilesLoaded(true);
        
        console.log('createNewFiles completed successfully, filesLoaded set to true');
      } else {
        console.warn('⚠️ No files created, keeping existing state');
        setFilesLoaded(true); // Still mark as loaded to prevent retries
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
        console.error(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }

      console.log(`✅ Proxied upload completed for ${file.name}, status: ${response.status}`);
      onProgress?.(100);
    } catch (error) {
      console.error(`❌ Proxied upload failed for ${file.name}:`, error);
      throw error;
    }
  };

  // Update file status in the job data and sync with backend
  const updateFileStatus = async (
    groupFilename: string,
    pdfFilename: string,
    status: 'uploading' | 'uploaded' | 'upload-failed'
  ): Promise<void> => {
    if (!jobData?.content_pipeline_files) return;

    console.log(`🔄 Updating status for ${pdfFilename} in group ${groupFilename} to ${status}`);

    const fileGroup = jobData.content_pipeline_files.find(f => f.filename === groupFilename);
    if (!fileGroup) {
      console.error(`File group ${groupFilename} not found in job data`);
      return;
    }

    const originalFileInfo = fileGroup.original_files?.[pdfFilename];
    if (!originalFileInfo) {
      console.error(`Original file info for ${pdfFilename} not found in file group ${groupFilename}`);
      return;
    }

    // Create a new copy of original_files with the updated status
    const updatedOriginalFiles = {
      ...(fileGroup.original_files || {}),
      [pdfFilename]: {
        ...originalFileInfo,
        status: status,
      },
    };

    // Now, update the backend - send only the specific status that changed
    try {
      console.log(`📡 Syncing status for ${pdfFilename} to backend (status only)...`, { pdf_filename: pdfFilename, status });

      const response = await contentPipelineApi.updatePdfFileStatus(groupFilename, pdfFilename, status);

      console.log(`✅ Successfully synced status for ${pdfFilename} to backend.`, response);

      // Update local state ONLY with the response from the backend (no optimistic updates)
      if (response.file) {
        const updatedFileFromBackend = response.file;
        
        console.log(`🔄 Updating local state with backend response for ${groupFilename}:`, updatedFileFromBackend);
        
        setJobData(prev => {
          if (!prev?.content_pipeline_files) return prev;
          
          const syncedContentPipelineFiles = prev.content_pipeline_files.map(file =>
            file.filename === groupFilename
              ? {
                  ...file,
                  original_files: updatedFileFromBackend.original_files || file.original_files,
                  extracted_files: updatedFileFromBackend.extracted_files || file.extracted_files,
                  firefly_assets: updatedFileFromBackend.firefly_assets || file.firefly_assets,
                  last_updated: new Date().toISOString()
                }
              : file
          );
          
          return { ...prev, content_pipeline_files: syncedContentPipelineFiles };
        });
        
        console.log(`✅ Local state updated with backend response for ${groupFilename}`);
      } else {
        console.warn(`⚠️ No file data in response for ${groupFilename}, updating local state directly`);
        
        // Fallback: update local state directly if no backend response
        const updatedContentPipelineFiles = jobData.content_pipeline_files.map(file =>
          file.filename === groupFilename
            ? { ...file, original_files: updatedOriginalFiles }
            : file
        );

        setJobData(prev => (prev ? { ...prev, content_pipeline_files: updatedContentPipelineFiles } : null));
      }
    } catch (error) {
      console.error(`❌ Failed to sync status for ${pdfFilename} to backend:`, error);
      // Don't update local state if backend update failed
    }
  };

  // Helper function to wait for a specified time
  const wait = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  // Upload a single file with retry logic
  const uploadSingleFile = async (groupFilename: string, filename: string, file: File, fileInfo: any, maxRetries: number = 3): Promise<void> => {
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        // Track this file as actively uploading (for UI progress)
        setUploadingFiles(prev => {
          const newSet = new Set(prev).add(filename);
          console.log(`📤 Added ${filename} to uploadingFiles set. Current files:`, Array.from(newSet));
          return newSet;
        });
        
        console.log(`🔄 Uploading ${filename} (attempt ${retryCount + 1}/${maxRetries})`);
        console.log(`📁 File path: ${fileInfo.file_path}`);
        
        // Get pre-signed URL
        const uploadUrl = await getPresignedUrl(fileInfo.file_path);
        
        // Upload file with progress tracking
        await uploadFileToS3(file, uploadUrl, (progress) => {
          setUploadProgress(prev => ({
            ...prev,
            [filename]: progress
          }));
        });
        
        // Mark as uploaded in local state and sync to backend
        await updateFileStatus(groupFilename, filename, 'uploaded');

        setUploadingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(filename);
          console.log(`🗑️ Removed ${filename} from uploadingFiles set. Remaining files:`, Array.from(newSet));
          console.log(`📊 Upload completion check: ${filename} finished, ${newSet.size} files still uploading`);
          
          // Trigger immediate check if this was the last file
          if (newSet.size === 0) {
            console.log('🚀 Last file finished uploading, scheduling immediate auto-navigate check...');
            // Schedule immediate check after state updates propagate
            setTimeout(() => {
              console.log('🔍 Immediate auto-navigate check triggered by last file completion');
              // The regular interval will handle the actual navigation
            }, 100);
          }
          
          return newSet;
        });
        
        // Clear upload progress for this file
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[filename];
          console.log(`🧹 Cleared upload progress for ${filename}`);
          return newProgress;
        });
        
        console.log(`✅ Successfully uploaded ${filename}`);
        return; // Success, exit the retry loop
        
      } catch (error) {
        retryCount++;
        console.error(`Failed to upload ${filename} (attempt ${retryCount}/${maxRetries}):`, error);
        
        if (retryCount < maxRetries) {
          console.log(`Retrying upload of ${filename} in 1 second...`);
          // Update status to show retry (and sync to backend)
          await updateFileStatus(groupFilename, filename, 'uploading');
          // Wait 1 second before retry
          await wait(1000);
        } else {
          // All retries failed
          console.error(`All retry attempts failed for ${filename}`);
          
          // Mark as failed and sync to backend
          await updateFileStatus(groupFilename, filename, 'upload-failed');
          setUploadingFiles(prev => {
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

  // Start the upload process for all files (parallel batches of 2)
  const startUploadProcess = async (files: File[]): Promise<void> => {
    if (!jobData?.content_pipeline_files) {
      console.log('startUploadProcess: No content_pipeline_files found');
      return;
    }
    
    console.log('🚀 Starting parallel upload process (2 files at a time) for files:', files.map(f => f.name));
    console.log('Job data for upload:', { job_id: jobData.job_id, content_pipeline_files_count: jobData.content_pipeline_files.length });
    
    // Create a mapping of file names to File objects
    const fileMap = new Map<string, File>();
    files.forEach(file => {
      fileMap.set(file.name, file);
    });
    
    // Collect all files to upload in order
    const filesToUpload: Array<{groupFilename: string, filename: string, file: File, fileInfo: any}> = [];
    
    jobData.content_pipeline_files.forEach((fileObj) => {
      if (!fileObj.original_files) return;
      
      Object.entries(fileObj.original_files).forEach(([filename, fileInfo]) => {
        const file = fileMap.get(filename);
        if (file) {
          filesToUpload.push({ groupFilename: fileObj.filename, filename, file, fileInfo });
        } else {
          console.warn(`File ${filename} not found in uploaded files`);
        }
      });
    });
    
    let uploadedCount = 0;
    let failedCount = 0;
    const batchSize = 2; // Upload 2 files at a time
    
    // Process files in batches of 2
    for (let i = 0; i < filesToUpload.length; i += batchSize) {
      const batch = filesToUpload.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(filesToUpload.length / batchSize)}: ${batch.map(b => b.filename).join(', ')}`);
      
      // Upload files in current batch in parallel
      const batchPromises = batch.map(async ({ groupFilename, filename, file, fileInfo }) => {
        try {
          await uploadSingleFile(groupFilename, filename, file, fileInfo);
          return { success: true, filename };
        } catch (error) {
          console.error(`Failed to upload ${filename} after all retries:`, error);
          return { success: false, filename, error };
        }
      });
      
      // Wait for all files in the batch to complete
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            uploadedCount++;
            console.log(`✅ Batch upload success: ${result.value.filename}`);
          } else {
            failedCount++;
            console.error(`❌ Batch upload failed: ${result.value.filename}`, result.value.error);
          }
        } else {
          failedCount++;
          const filename = batch[index]?.filename || 'unknown';
          console.error(`❌ Batch upload promise rejected: ${filename}`, result.reason);
        }
      });
      
      // Update overall progress after each batch
      const overallProgress = ((uploadedCount + failedCount) / filesToUpload.length) * 100;
      console.log(`📊 Batch ${Math.floor(i / batchSize) + 1} completed. Overall progress: ${Math.round(overallProgress)}% (${uploadedCount} uploaded, ${failedCount} failed, ${filesToUpload.length - uploadedCount - failedCount} remaining)`);
      
      // Small delay between batches to avoid overwhelming the server
      if (i + batchSize < filesToUpload.length) {
        await wait(500); // 500ms delay between batches
      }
    }
    
     // Log final results
     if (failedCount === 0) {
       console.log('✅ All files uploaded successfully in parallel batches');
     } else if (uploadedCount > 0) {
       console.log(`⚠️ Parallel upload completed with ${failedCount} failures out of ${filesToUpload.length} files`);
     } else {
       console.log('❌ All file uploads failed');
     }
  };



  const getStatusColor = (status: string) => {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('succeed') || lowerStatus.includes('completed')) return '#10b981';
    if (lowerStatus.includes('fail') || lowerStatus.includes('error')) return '#ef4444';
    if (lowerStatus.includes('progress') || lowerStatus.includes('running') || lowerStatus.includes('processing') || lowerStatus.includes('started')) return '#f59e0b';
    return '#3b82f6';
  };

  const capitalizeStatus = (status: string) => {
    if (!status) return '';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getJobDisplayName = () => {
    if (!jobData?.job_id) return 'Unknown Job';
    return jobData.job_id;
  };

  const getJobTitle = () => {
    if (!jobData) return 'Loading...';
    const parts = [
      jobData.app_name,
      jobData.filename_prefix,
      jobData.Subset_name
    ].filter(Boolean);
    return parts.join(' - ') || 'Unknown Job';
  };

  const isStatusActive = (status: string) => {
    const lowerStatus = status.toLowerCase();
    return lowerStatus.includes('uploading') || 
           lowerStatus.includes('extracting') || 
           lowerStatus.includes('generating');
  };

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
        <div className={styles.loading}>
          <Spinner />
          <p>Loading job details...</p>
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
          <p>{error}</p>
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

  if (!jobData) {
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
        title={getJobTitle()}
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
            
            {/* Job Overview - Compact */}
            <div style={{ 
              marginBottom: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 16,
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              {/* Status Badge */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 20,
                background: getStatusColor(jobData.job_status || ''),
                boxShadow: `0 2px 8px ${getStatusColor(jobData.job_status || '')}30`,
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}>
                {/* Loading spinner for active statuses */}
                {isStatusActive(jobData.job_status || '') && (
                  <div style={{
                    width: 14,
                    height: 14,
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTop: '2px solid white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                )}
                <span style={{ 
                  color: 'white', 
                  fontSize: 14, 
                  fontWeight: 600,
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)'
                }}>
                  {capitalizeStatus(jobData.job_status || 'Unknown')}
                </span>
              </div>
              
              {/* Metadata - Less prominent */}
              <div style={{
                display: 'flex',
                gap: 16,
                fontSize: 12,
                color: '#6b7280'
              }}>
                <span>Files: <span style={{ color: '#9ca3af' }}>{jobData.content_pipeline_files?.length || 0}</span></span>
                {jobData.created_at && (
                  <span>Created: <span style={{ color: '#9ca3af' }}>{new Date(jobData.created_at).toLocaleDateString()}</span></span>
                )}
                {jobData.job_id && (
                  <span>ID: <span style={{ color: '#9ca3af', fontFamily: 'monospace', fontSize: 11 }}>{jobData.job_id}</span></span>
                )}
              </div>
            </div>



            {/* Action Required Banner - Only show when status is "extracted" */}
            {jobData?.job_status?.toLowerCase() === 'extracted' && (
              <div style={{ marginBottom: 32 }}>
                {/* Prominent Call-to-Action Banner */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(147, 51, 234, 0.15))',
                  border: '2px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: 16,
                  padding: 24,
                  marginBottom: 32,
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* Animated background accent */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #3b82f6)',
                    backgroundSize: '200% 100%',
                    animation: 'gradient-shift 3s ease-in-out infinite'
                  }} />
                  
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    marginBottom: 16
                  }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      flexShrink: 0
                    }}>
                      ⚡
                    </div>
                    <div>
                      <h2 style={{
                        fontSize: '1.4rem',
                        fontWeight: 700,
                        color: '#f8f8f8',
                        margin: '0 0 8px 0'
                      }}>
                        🎯 Action Required: Configure Digital Assets
                      </h2>
                      <p style={{
                        fontSize: '1rem',
                        color: '#bfdbfe',
                        margin: 0,
                        lineHeight: 1.5
                      }}>
                        Your files have been successfully extracted! Now configure your digital assets by selecting a PSD template, color variants, and layers below.
                      </p>
                    </div>
                  </div>
                  
                  <div style={{
                    display: 'flex',
                    gap: 16,
                    fontSize: 14,
                    color: '#93c5fd',
                    marginBottom: 24
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                      Step 1: Select PSD Template
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                      Step 2: Choose Color Variants
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6' }} />
                      Step 3: Select Layers
                    </span>
                  </div>

                {/* Configuration Sections */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* PSD File Selection */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: 16,
                      fontWeight: 600,
                      color: '#f8f8f8',
                      marginBottom: 12
                    }}>
                      Select PSD
                    </label>
                    <select
                      value={selectedPhysicalFile}
                      onChange={(e) => setSelectedPhysicalFile(e.target.value)}
                      disabled={loadingPhysicalFiles}
                      style={{
                        width: '100%',
                        maxWidth: 400,
                        padding: '12px 16px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: 8,
                        color: '#f8f8f8',
                        fontSize: 14,
                        outline: 'none',
                        transition: 'border-color 0.2s',
                        boxSizing: 'border-box'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#60a5fa';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                      }}
                    >
                      <option value="" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                        {loadingPhysicalFiles ? 'Loading PSD files...' : 'Select PSD file...'}
                      </option>
                      {physicalJsonFiles.map((file, index) => {
                        const filename = file.name.split('/').pop() || file.name;
                        const displayName = filename.replace('.json', '');
                        return (
                          <option 
                            key={index} 
                            value={file.name} 
                            style={{ background: '#1f2937', color: '#f8f8f8' }}
                          >
                            {displayName}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Color Variants and Layers Selection - Side by Side */}
                  {selectedPhysicalFile && jsonData && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {/* Color Variants Selection */}
                      <div style={{ flex: 1 }}>
                        <label style={{
                          display: 'block',
                          fontSize: 16,
                          fontWeight: 600,
                          color: '#f8f8f8',
                          marginBottom: 12
                        }}>
                          Select Color Variants
                        </label>
                        {(() => {
                          const spotGroup = jsonData.layers?.find((layer: any) => 
                            layer.name?.toLowerCase().includes('spot group')
                          );
                          
                          const collectSolidColorLayers = (layer: any): any[] => {
                            const layers: any[] = [];
                            if (layer.type === 'solidcolorfill') {
                              layers.push(layer);
                            }
                            if (layer.children) {
                              layer.children.forEach((child: any) => {
                                layers.push(...collectSolidColorLayers(child));
                              });
                            }
                            return layers;
                          };
                          
                          const solidColorLayers = spotGroup ? collectSolidColorLayers(spotGroup) : [];
                          
                          const toggleLayer = (layerId: string) => {
                            const newSelected = new Set(selectedLayers);
                            if (newSelected.has(layerId)) {
                              newSelected.delete(layerId);
                            } else {
                              newSelected.add(layerId);
                            }
                            setSelectedLayers(newSelected);
                          };
                          
                          return solidColorLayers.length > 0 ? (
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(2, 1fr)',
                              gap: 4,
                              maxWidth: 300
                            }}>
                              {solidColorLayers.map((layer: any, index: number) => {
                                const layerId = `${layer.id}-${layer.name}`;
                                const isSelected = selectedLayers.has(layerId);
                                
                                return (
                                  <label key={index} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    color: '#f8f8f8',
                                    padding: '4px 8px',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    borderRadius: 6,
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    transition: 'background-color 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                                  }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleLayer(layerId)}
                                      style={{
                                        width: 14,
                                        height: 14,
                                        cursor: 'pointer',
                                        flexShrink: 0
                                      }}
                                    />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {layer.name || `Layer ${layer.id || index + 1}`}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{
                              fontSize: 14,
                              color: '#9ca3af',
                              fontStyle: 'italic'
                            }}>
                              No color variants available
                            </div>
                          );
                        })()}
                      </div>

                                            {/* Select Layers from Extracted Files */}
                      <div style={{ flex: 1 }}>
                        <label style={{
                          display: 'block',
                          fontSize: 16,
                          fontWeight: 600,
                          color: '#f8f8f8',
                          marginBottom: 12
                        }}>
                          Select Layers
                        </label>
                        {(() => {
                          // Extract unique layer names from all extracted files in the job
                          const extractedLayerNames = new Set<string>();
                          
                          // Function to extract layer name from filename
                          const extractLayerName = (filename: string): string | null => {
                            // Remove file extension first
                            const nameWithoutExt = filename.replace(/\.(tif|pdf|png|jpg|jpeg)$/i, '');
                            
                            // Split by underscore
                            const parts = nameWithoutExt.split('_');
                            
                            // Need at least 3 parts: prefix, number, layer_name
                            if (parts.length < 3) return null;
                            
                            // Remove first part (app prefix like "25dnyc")
                            // Remove second part (card number like "4905")
                            // Keep the rest joined with underscores
                            const layerParts = parts.slice(2);
                            const layerName = layerParts.join('_');
                            
                            return layerName;
                          };
                          
                          // Collect layer names from all extracted files
                          if (jobData?.content_pipeline_files) {
                            jobData.content_pipeline_files.forEach(fileGroup => {
                              if (fileGroup.extracted_files) {
                                Object.keys(fileGroup.extracted_files).forEach(filename => {
                                  const layerName = extractLayerName(filename);
                                  if (layerName) {
                                    extractedLayerNames.add(layerName);
                                  }
                                });
                              }
                            });
                          }
                          
                          const layerNamesArray = Array.from(extractedLayerNames).sort();
                          
                          const toggleExtractedLayer = (layerName: string) => {
                            const newSelected = new Set(selectedExtractedLayers);
                            if (newSelected.has(layerName)) {
                              newSelected.delete(layerName);
                            } else {
                              newSelected.add(layerName);
                            }
                            setSelectedExtractedLayers(newSelected);
                          };
                          
                          return layerNamesArray.length > 0 ? (
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                              maxWidth: 200
                            }}>
                              {layerNamesArray.map((layerName, index) => {
                                const isSelected = selectedExtractedLayers.has(layerName);
                                
                                return (
                                  <label key={index} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    color: '#f8f8f8',
                                    padding: '4px 8px',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    borderRadius: 6,
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    transition: 'background-color 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                                  }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleExtractedLayer(layerName)}
                                      style={{
                                        width: 14,
                                        height: 14,
                                        cursor: 'pointer',
                                        flexShrink: 0
                                      }}
                                    />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {layerName}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{
                              fontSize: 14,
                              color: '#9ca3af',
                              fontStyle: 'italic'
                            }}>
                              No extracted layers available
                            </div>
                          );
                        })()}
                      </div>

                      {/* Create Assets Button */}
                      {selectedLayers.size > 0 && selectedExtractedLayers.size > 0 && (
                        <div style={{ 
                          display: 'flex', 
                          flexDirection: 'column', 
                          justifyContent: 'center', 
                          alignItems: 'center',
                          minWidth: 200,
                          marginLeft: 16
                        }}>
                          <button
                            onClick={async () => {
                              console.log('🎨 Creating digital assets with selected options:', {
                                selectedFile: selectedPhysicalFile,
                                psdFile: jsonData?.psd_file,
                                selectedLayers: Array.from(selectedLayers),
                                selectedExtractedLayers: Array.from(selectedExtractedLayers),
                                totalColors: selectedLayers.size,
                                totalLayers: selectedExtractedLayers.size
                              });

                              setCreatingAssets(true);

                              try {
                                // Map selected color variants to the required format
                                const colors = Array.from(selectedLayers).map((layerId) => {
                                  const [id, name] = layerId.split('-'); // Extract actual ID and name from "id-name" format
                                  return {
                                    id: parseInt(id, 10), // Use actual layer ID from JSON
                                    name: name || layerId // Use extracted name or fallback to full layerId
                                  };
                                });

                                // Extract PSD filename from the selected physical file
                                const psdFile = selectedPhysicalFile.split('/').pop()?.replace('.json', '.psd') || '';

                                // Use selected extracted layers instead of hardcoded layers
                                const layers = Array.from(selectedExtractedLayers);

                                const payload = {
                                  colors,
                                  layers,
                                  psd_file: psdFile
                                };

                                console.log('📋 API Payload:', payload);

                                // Make the API call
                                const response = await contentPipelineApi.generateAssets(jobData!.job_id!, payload);
                                
                                console.log('✅ Assets creation response:', response);
                                
                                // Navigate back to jobs list after successful creation
                                router.push('/jobs');
                                
                              } catch (error) {
                                console.error('❌ Error creating assets:', error);
                                alert(`Failed to create assets: ${error instanceof Error ? error.message : 'Unknown error'}`);
                                setCreatingAssets(false);
                              }
                            }}
                            disabled={creatingAssets}
                            style={{
                              padding: '16px 32px',
                              background: creatingAssets 
                                ? 'rgba(156, 163, 175, 0.5)' 
                                : 'linear-gradient(135deg, #10b981, #059669)',
                              border: 'none',
                              borderRadius: 12,
                              color: 'white',
                              fontSize: 16,
                              fontWeight: 600,
                              cursor: creatingAssets ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s',
                              boxShadow: creatingAssets 
                                ? 'none' 
                                : '0 8px 24px rgba(16, 185, 129, 0.3)',
                              minHeight: 60
                            }}
                            onMouseEnter={(e) => {
                              if (!creatingAssets) {
                                e.currentTarget.style.transform = 'scale(1.05)';
                                e.currentTarget.style.boxShadow = '0 12px 32px rgba(16, 185, 129, 0.4)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!creatingAssets) {
                                e.currentTarget.style.transform = 'scale(1)';
                                e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.3)';
                              }
                            }}
                          >
                            {creatingAssets ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{
                                  width: 16,
                                  height: 16,
                                  border: '2px solid rgba(255, 255, 255, 0.3)',
                                  borderTop: '2px solid white',
                                  borderRadius: '50%',
                                  animation: 'spin 1s linear infinite'
                                }} />
                                Creating...
                              </div>
                            ) : (
                              '🎨 Create Assets'
                            )}
                          </button>
                          <div style={{
                            fontSize: 12,
                            color: '#9ca3af',
                            marginTop: 8,
                            textAlign: 'center'
                          }}>
                            {selectedLayers.size} colors • {selectedExtractedLayers.size} layers
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>




                </div>
               </div>
             )}

            {/* Files Details - Always show */}
            <div style={{ marginTop: 32 }}>
                <h2 style={{
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  color: '#f8f8f8',
                  marginBottom: 24
                }}>
                  📁 Files ({jobData.content_pipeline_files?.length || 0})
                </h2>

                
                {loadingFiles ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '48px 0',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
                    <h3 style={{ color: '#9ca3af', fontSize: 18, marginBottom: 8 }}>Loading Files...</h3>
                    <p style={{ color: '#6b7280', fontSize: 14 }}>
                                          {jobData.job_status === 'uploading' 
                      ? 'Creating file objects...' 
                      : 'Fetching file objects...'}
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {jobData.content_pipeline_files && jobData.content_pipeline_files.length > 0 ? (
                      jobData.content_pipeline_files.map((file, index) => (
                        <div key={index} style={{
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: 12,
                          padding: 20
                        }}>
                          {/* File Header */}
                          <div style={{ marginBottom: 20 }}>
                            <h3 style={{
                              fontSize: '1.2rem',
                              fontWeight: 600,
                              color: '#f8f8f8',
                              margin: '0 0 8px 0',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8
                            }}>
                              📄 {file.filename}
                            </h3>
                            {file.last_updated && (
                              <p style={{
                                color: '#9ca3af',
                                fontSize: 14,
                                margin: 0
                              }}>
                                Last updated: {new Date(file.last_updated).toLocaleString()}
                              </p>
                            )}
                          </div>

                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                            gap: 20,
                            marginBottom: 24
                          }}>
                            {/* Original PDF Files */}
                            <div>
                              <h4 style={{
                                color: '#f59e0b',
                                fontSize: 16,
                                fontWeight: 600,
                                margin: '0 0 12px 0'
                              }}>
                                📄 Original PDF Files ({file.original_files ? Object.keys(file.original_files).length : 0})
                              </h4>
                              <div style={{
                                background: 'rgba(245, 158, 11, 0.1)',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                borderRadius: 8,
                                padding: 12,
                                maxHeight: 200,
                                overflowY: 'auto'
                              }}>
                                {file.original_files && Object.keys(file.original_files).length > 0 ? (
                                  Object.entries(file.original_files).map(([filename, fileInfo], origIndex) => (
                                    <div key={origIndex} style={{
                                      marginBottom: 8,
                                      fontSize: 13,
                                      color: '#fbbf24',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center'
                                    }}>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span>📋</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <span>{filename}</span>
                                          {/* Show loading spinner when upload is actively happening */}
                                          {uploadingFiles.has(filename) && (
                                            <div style={{
                                              width: 12,
                                              height: 12,
                                              border: '1.5px solid rgba(245, 158, 11, 0.3)',
                                              borderTop: '1.5px solid #f59e0b',
                                              borderRadius: '50%',
                                              animation: 'spin 1s linear infinite',
                                              marginLeft: 4
                                            }} />
                                          )}
                                        </span>
                                        {/* Show animated uploading text for files being uploaded */}
                                        {uploadingFiles.has(filename) && (
                                          <span style={{
                                            fontSize: 11,
                                            color: '#f59e0b',
                                            animation: 'pulse 2s infinite',
                                            marginLeft: 4
                                          }}>
                                            Uploading...
                                          </span>
                                        )}
                                      </span>
                                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        <span style={{
                                          fontSize: 11,
                                          padding: '2px 6px',
                                          borderRadius: 4,
                                          background: 'rgba(245, 158, 11, 0.2)',
                                          color: '#f59e0b'
                                        }}>
                                          {fileInfo.card_type}
                                        </span>
                                        <span style={{
                                          fontSize: 11,
                                          padding: '2px 6px',
                                          borderRadius: 4,
                                          background: fileInfo.status.toLowerCase() === 'uploaded' 
                                            ? 'rgba(16, 185, 129, 0.2)' 
                                            : fileInfo.status.toLowerCase() === 'upload-failed'
                                            ? 'rgba(239, 68, 68, 0.2)'
                                            : 'rgba(249, 115, 22, 0.2)',
                                          color: fileInfo.status.toLowerCase() === 'uploaded' 
                                            ? '#34d399' 
                                            : fileInfo.status.toLowerCase() === 'upload-failed'
                                            ? '#fca5a5'
                                            : '#fdba74'
                                        }}>
                                          {capitalizeStatus(fileInfo.status)}
                                        </span>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>
                                    No original PDF files found
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Extracted Layers - Only show if there are extracted files */}
                            {file.extracted_files && Object.keys(file.extracted_files).length > 0 && (
                              <div>
                                <div style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: 12
                                }}>
                                  <h4 style={{
                                    color: '#60a5fa',
                                    fontSize: 16,
                                    fontWeight: 600,
                                    margin: 0
                                  }}>
                                    🖼️ Extracted Layers ({Object.keys(file.extracted_files).length})
                                  </h4>
                                  {(() => {
                                    // Check if all extracted files have "uploaded" status (case insensitive)
                                    const allUploaded = Object.values(file.extracted_files || {}).every(
                                      extractedFile => extractedFile.status.toLowerCase() === 'uploaded'
                                    );
                                    

                                    
                                    return allUploaded ? (
                                      <button
                                        onClick={() => {
                                          // Collect file paths from extracted files
                                          const filePaths = Object.values(file.extracted_files || {}).map(extractedFile => 
                                            extractedFile.file_path
                                          ).filter(path => path);
                                          
                                          const baseName = file.filename.replace('.pdf', '').replace('.PDF', '');
                                          // Use jobId since jobPath is not available
                                          const jobPath = jobData?.job_id || '';
                                          

                                          
                                          // Pass the file paths as a query parameter
                                          const filePathsParam = encodeURIComponent(JSON.stringify(filePaths));
                                          router.push(`/job/preview?jobPath=${encodeURIComponent(jobPath)}&fileName=${encodeURIComponent(baseName)}&type=extracted&filePaths=${filePathsParam}`);
                                        }}
                                        style={{
                                          background: 'rgba(59, 130, 246, 0.2)',
                                          border: '1px solid rgba(59, 130, 246, 0.4)',
                                          borderRadius: 6,
                                          color: '#60a5fa',
                                          cursor: 'pointer',
                                          fontSize: 12,
                                          padding: '6px 12px',
                                          transition: 'all 0.2s',
                                          fontWeight: 500
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = 'rgba(59, 130, 246, 0.3)';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                                        }}
                                      >
                                        👁️ Preview Layers
                                      </button>
                                    ) : (
                                      <span style={{
                                        fontSize: 12,
                                        color: '#9ca3af',
                                        padding: '6px 12px',
                                        border: '1px solid rgba(156, 163, 175, 0.3)',
                                        borderRadius: 6,
                                        background: 'rgba(156, 163, 175, 0.1)'
                                      }}>
                                        ⏳ Waiting for all layers to be uploaded
                                      </span>
                                    );
                                  })()}
                                </div>
                                <div style={{
                                  background: 'rgba(59, 130, 246, 0.1)',
                                  border: '1px solid rgba(59, 130, 246, 0.3)',
                                  borderRadius: 8,
                                  padding: 12,
                                  maxHeight: 200,
                                  overflowY: 'auto'
                                }}>
                                  {Object.entries(file.extracted_files).map(([filename, extractedFile], extIndex) => (
                                    <div key={extIndex} style={{
                                      marginBottom: 8,
                                      fontSize: 13,
                                      color: '#bfdbfe',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center'
                                    }}>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span>🖼️</span>
                                        <span>{filename}</span>
                                      </span>
                                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        <span style={{ 
                                          background: 'rgba(59, 130, 246, 0.2)', 
                                          padding: '2px 6px', 
                                          borderRadius: 4,
                                          color: '#60a5fa',
                                          fontSize: 11
                                        }}>
                                          {extractedFile.layer_type}
                                        </span>
                                        <span style={{
                                          fontSize: 11,
                                          padding: '2px 6px',
                                          borderRadius: 4,
                                          background: extractedFile.status.toLowerCase() === 'uploaded' 
                                            ? 'rgba(16, 185, 129, 0.2)' 
                                            : 'rgba(249, 115, 22, 0.2)',
                                          color: extractedFile.status.toLowerCase() === 'uploaded' 
                                            ? '#34d399' 
                                            : '#fdba74'
                                        }}>
                                          {capitalizeStatus(extractedFile.status)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Firefly Assets - Only show if there are firefly assets */}
                          {file.firefly_assets && Object.keys(file.firefly_assets).length > 0 && (
                            <div>
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 12
                              }}>
                                <h4 style={{
                                  color: '#34d399',
                                  fontSize: 16,
                                  fontWeight: 600,
                                  margin: 0
                                }}>
                                  🎨 Firefly Assets ({Object.keys(file.firefly_assets).length})
                                </h4>
                                {(() => {
                                  // Check if all firefly assets have "succeeded" status (case insensitive)
                                  const allSucceeded = Object.values(file.firefly_assets || {}).every(
                                    asset => asset.status.toLowerCase() === 'succeeded'
                                  );
                                  

                                  
                                  return allSucceeded ? (
                                    <button
                                      onClick={() => {
                                        // Use the actual file paths from firefly assets
                                        const filePaths = Object.values(file.firefly_assets || {}).map(asset => 
                                          asset.file_path
                                        ).filter(path => path);
                                        
                                        const baseName = file.filename.replace('.pdf', '').replace('.PDF', '');
                                        // Use jobId since jobPath is not available
                                        const jobPath = jobData?.job_id || '';
                                        

                                        
                                        // Pass the file paths as a query parameter
                                        const filePathsParam = encodeURIComponent(JSON.stringify(filePaths));
                                        router.push(`/job/preview?jobPath=${encodeURIComponent(jobPath)}&fileName=${encodeURIComponent(baseName)}&type=firefly&filePaths=${filePathsParam}`);
                                      }}
                                      style={{
                                        background: 'rgba(16, 185, 129, 0.2)',
                                        border: '1px solid rgba(16, 185, 129, 0.4)',
                                        borderRadius: 6,
                                        color: '#34d399',
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        padding: '6px 12px',
                                        transition: 'all 0.2s',
                                        fontWeight: 500
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(16, 185, 129, 0.3)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)';
                                      }}
                                    >
                                      👁️ Preview Final Assets
                                    </button>
                                  ) : (
                                    <span style={{
                                      fontSize: 12,
                                      color: '#9ca3af',
                                      padding: '6px 12px',
                                      border: '1px solid rgba(156, 163, 175, 0.3)',
                                      borderRadius: 6,
                                      background: 'rgba(156, 163, 175, 0.1)'
                                    }}>
                                                                              ⏳ Waiting for all assets to succeed
                                    </span>
                                  );
                                })()}
                              </div>
                              <div style={{
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                borderRadius: 8,
                                padding: 12
                              }}>
                                {Object.entries(file.firefly_assets).map(([filename, asset], assetIndex) => (
                                  <div key={assetIndex} style={{
                                    marginBottom: 8,
                                    fontSize: 13,
                                    color: '#86efac',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span>🎨</span>
                                      <span>{filename}</span>
                                    </span>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                      <span style={{
                                        fontSize: 11,
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                        background: asset.status.toLowerCase().includes('succeed') || asset.status.toLowerCase() === 'created'
                                          ? 'rgba(16, 185, 129, 0.2)' 
                                          : asset.status.toLowerCase().includes('fail')
                                          ? 'rgba(239, 68, 68, 0.2)'
                                          : 'rgba(249, 115, 22, 0.2)',
                                        color: asset.status.toLowerCase().includes('succeed') || asset.status.toLowerCase() === 'created'
                                          ? '#34d399' 
                                          : asset.status.toLowerCase().includes('fail')
                                          ? '#fca5a5'
                                          : '#fdba74'
                                      }}>
                                        {capitalizeStatus(asset.status)}
                                      </span>
                                      {asset.card_type && (
                                        <span style={{ 
                                          background: 'rgba(16, 185, 129, 0.2)', 
                                          padding: '2px 6px', 
                                          borderRadius: 4,
                                          fontSize: 11,
                                          color: '#34d399'
                                        }}>
                                          {asset.card_type}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div style={{
                        textAlign: 'center',
                        padding: '24px 0',
                        color: '#9ca3af',
                        fontSize: 14
                      }}>
                        {!filesLoaded && !loadingFiles 
                          ? 'Files not loaded yet.' 
                          : filesLoaded && (!jobData.content_pipeline_files || jobData.content_pipeline_files.length === 0)
                          ? 'No files available for this job.'
                          : 'Loading files...'}
                      </div>
                    )}
                  </div>
                )}
              </div>

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