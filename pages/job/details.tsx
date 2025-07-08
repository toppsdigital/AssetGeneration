import { useRouter } from 'next/router';
import { useEffect, useState, useCallback } from 'react';
import NavBar from '../../components/NavBar';
import styles from '../../styles/Edit.module.css';
import Spinner from '../../components/Spinner';
import { contentPipelineApi, JobData as APIJobData, FileData } from '../../web/utils/contentPipelineApi';

interface JobData {
  // Core API fields
  job_id?: string;
  job_status?: string;
  app_name: string;
  release_name: string;
  source_folder: string;
  description?: string;
  progress_percentage?: number;
  current_step?: string;
  created_at?: string;
  last_updated?: string;
  
  // Legacy UI fields for backward compatibility
  psd_file?: string;
  template?: string;
  total_files?: number;
  files?: JobFile[];
  timestamp?: string;
  Subset_name?: string;
  job_path?: string;
  
  // API files as separate property
  api_files?: string[];
  content_pipeline_files?: ContentPipelineFile[];
}

// Custom file structure for the Content Pipeline API
interface ContentPipelineFile {
  filename: string;
  last_updated?: string;
  original_files?: Record<string, {
    card_type: 'front' | 'back';
    file_path: string;
    status: 'Uploading' | 'Uploaded' | 'Failed';
  }>;
  extracted_files?: (string | ExtractedFile)[];
  firefly_assets?: FireflyAsset[];
}

interface ExtractedFile {
  filename: string;
  file_path?: string;
  uploaded?: boolean;
  layer_type?: string;
}

interface JobFile {
  filename: string;
  extracted?: string;
  digital_assets?: string;
  last_updated?: string;
  extracted_files?: (string | ExtractedFile)[];
  original_files?: OriginalFile[];
  firefly_assets?: FireflyAsset[];
}

interface OriginalFile {
  filename: string;
  card_type: string;
}

interface FireflyAsset {
  filename: string;
  status: string;
  spot_number?: string;
  color_variant?: string;
  file_path?: string;
}

export default function JobDetailsPage() {
  const router = useRouter();
  const { jobId, startUpload, appName, releaseName, sourceFolder, status, createdAt, files, description } = router.query;
  
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [uploadStarted, setUploadStarted] = useState(false);

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
      if (appName && releaseName && sourceFolder && status) {
        loadJobDetailsFromParams();
      } else {
        loadJobDetails();
      }
    }
  }, [jobId, appName, releaseName, sourceFolder, status]);

  // Load file objects after job details are loaded
  useEffect(() => {
    console.log('🔄 useEffect[jobData, filesLoaded] triggered at', new Date().toISOString(), ':', { 
      hasJobData: !!jobData, 
      hasApiFiles: !!jobData?.api_files?.length, 
      filesLoaded, 
      jobStatus: jobData?.job_status,
      uploadStarted
    });
    
    // Don't reload files if upload has started - this prevents overwriting status updates
    if (uploadStarted) {
      console.log('🔄 Skipping file loading - upload in progress, avoiding status overwrites');
      return;
    }
    
    if (jobData && jobData.api_files && jobData.api_files.length > 0 && !filesLoaded) {
      console.log('🔄 Loading files - condition met');
      if (jobData.job_status === 'Upload in progress' || jobData.job_status === 'Upload started') {
        // Create new file objects for jobs that are starting upload
        console.log('🔄 Calling createNewFiles');
        createNewFiles();
      } else {
        // Load existing file objects for jobs that already have them
        console.log('🔄 Calling loadExistingFiles');
        loadExistingFiles();
      }
    } else {
      console.log('🔄 Skipping file loading - condition not met');
    }
  }, [jobData, filesLoaded]);

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
          if (fileInfo.status === 'Uploading') {
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

  // Reset upload state when job changes
  useEffect(() => {
    setUploadStarted(false);
    setUploadProgress({});
    setUploadingFiles(new Set());
  }, [jobData?.job_id]);

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
      
      // Create job data from query parameters
      const mappedJobData: JobData = {
        job_id: jobId as string,
        app_name: appName as string,
        release_name: releaseName as string,
        source_folder: sourceFolder as string,
        job_status: status as string,
        created_at: createdAt as string,
        description: description as string,
        api_files: parsedFiles,
        files: [], // Initialize empty legacy files array
        content_pipeline_files: [], // Initialize empty Content Pipeline files array
        Subset_name: sourceFolder as string // Map source_folder to Subset_name for UI compatibility
      };
      
      console.log('🔄 setJobData called from: loadJobDetailsFromParams at', new Date().toISOString());
      setJobData(mappedJobData);
      
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
      
      // Map API response to our local interface
      const mappedJobData: JobData = {
        ...response.job,
        api_files: response.job.files, // Store API files separately
        files: [], // Initialize empty legacy files array
        content_pipeline_files: [], // Initialize empty Content Pipeline files array
        Subset_name: response.job.source_folder // Map source_folder to Subset_name for UI compatibility
      };
      
      console.log('🔄 setJobData called from: loadJobDetails at', new Date().toISOString());
      setJobData(mappedJobData);
      
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
      
      // Map API response to our ContentPipelineFile format
      const fileObjects: ContentPipelineFile[] = batchResponse.files.map(apiFile => ({
        filename: apiFile.filename,
        last_updated: new Date().toISOString(), // Use current time since API doesn't provide last_updated
        original_files: apiFile.original_files || apiFile.metadata?.original_files || {},
        extracted_files: apiFile.extracted_files || apiFile.metadata?.extracted_files || [],
        firefly_assets: apiFile.firefly_assets || apiFile.metadata?.firefly_assets || []
      }));
      
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
      setLoadingFiles(false);
      
    } catch (error) {
      console.error('Error fetching file objects:', error);
      setError('Failed to fetch file objects: ' + (error as Error).message);
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
      
      // Create file objects based on the grouped filenames
      const fileObjects: ContentPipelineFile[] = jobData.api_files.map(filename => {
        const originalFiles: Record<string, {
          card_type: 'front' | 'back';
          file_path: string;
          status: 'Uploading' | 'Uploaded' | 'Failed';
        }> = {};
        
        // Add front and back PDF files
        const frontFilename = `${filename}_FR.pdf`;
        const backFilename = `${filename}_BK.pdf`;
        
        originalFiles[frontFilename] = {
          card_type: 'front',
          file_path: `${jobData.app_name}/PDFs/${frontFilename}`,
          status: 'Uploading'
        };
        
        originalFiles[backFilename] = {
          card_type: 'back',
          file_path: `${jobData.app_name}/PDFs/${backFilename}`,
          status: 'Uploading'
        };
        
        return {
          filename,
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
      let finalFileObjects: ContentPipelineFile[] = [];
      
      // Add successfully created files
      if (batchResponse.created_files && batchResponse.created_files.length > 0) {
        console.log('✅ Successfully created files:', batchResponse.created_files.length);
        finalFileObjects = batchResponse.created_files.map((apiFile: any) => ({
          filename: apiFile.filename,
          last_updated: new Date().toISOString(),
          original_files: apiFile.original_files || apiFile.metadata?.original_files || {},
          extracted_files: apiFile.extracted_files || apiFile.metadata?.extracted_files || [],
          firefly_assets: apiFile.firefly_assets || apiFile.metadata?.firefly_assets || []
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
            const existingFileObjects = existingFilesResponse.files.map((apiFile: any) => ({
              filename: apiFile.filename,
              last_updated: new Date().toISOString(),
              original_files: apiFile.original_files || apiFile.metadata?.original_files || {},
              extracted_files: apiFile.extracted_files || apiFile.metadata?.extracted_files || [],
              firefly_assets: apiFile.firefly_assets || apiFile.metadata?.firefly_assets || []
            }));
            
            finalFileObjects = [...finalFileObjects, ...existingFileObjects];
            
          } catch (loadError) {
            console.error('❌ Error loading existing files:', loadError);
            // If we can't load existing files, create them manually from our local data
            const manualFileObjects = alreadyExistFiles.map((failedFile: any) => {
              const originalFileData = fileObjects.find(f => f.filename === failedFile.file_data.filename);
              return originalFileData || {
                filename: failedFile.file_data.filename,
                last_updated: new Date().toISOString(),
                original_files: failedFile.file_data.original_files || failedFile.file_data.metadata?.original_files || {}
              };
            });
            
            finalFileObjects = [...finalFileObjects, ...manualFileObjects];
          }
        }
      }
      
      console.log('📁 Final file objects count:', finalFileObjects.length);
      
      // Update job data with all files (created + existing)
      const updatedJobData = {
        ...jobData,
        content_pipeline_files: finalFileObjects
      };
      
      console.log('Setting job data with file objects:', updatedJobData);
      console.log('🔄 setJobData called from: createNewFiles at', new Date().toISOString());
      setJobData(updatedJobData);
      setFilesLoaded(true);
      setLoadingFiles(false);
      
      console.log('createNewFiles completed successfully, filesLoaded set to true');
      
    } catch (error) {
      console.error('Error creating file objects:', error);
      setError('Failed to create file objects: ' + (error as Error).message);
      setLoadingFiles(false);
    }
  };

    // Update job status using Content Pipeline API
  const updateJobStatus = async (status: string, progressPercentage?: number, currentStep?: string): Promise<void> => {
    if (!jobData?.job_id) return;
    
    try {
      console.log('Updating job status:', { status, progressPercentage, currentStep });
      const response = await contentPipelineApi.updateJobStatus(
        jobData.job_id,
        status,
        progressPercentage,
        currentStep
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
    status: 'Uploading' | 'Uploaded' | 'Failed'
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
                  original_files: updatedFileFromBackend.original_files || updatedFileFromBackend.metadata?.original_files || file.original_files,
                  extracted_files: updatedFileFromBackend.extracted_files || updatedFileFromBackend.metadata?.extracted_files || file.extracted_files,
                  firefly_assets: updatedFileFromBackend.firefly_assets || updatedFileFromBackend.metadata?.firefly_assets || file.firefly_assets,
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
        await updateFileStatus(groupFilename, filename, 'Uploaded');

        setUploadingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(filename);
          console.log(`🗑️ Removed ${filename} from uploadingFiles set. Remaining files:`, Array.from(newSet));
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
          await updateFileStatus(groupFilename, filename, 'Uploading');
          // Wait 1 second before retry
          await wait(1000);
        } else {
          // All retries failed
          console.error(`All retry attempts failed for ${filename}`);
          
          // Mark as failed and sync to backend
          await updateFileStatus(groupFilename, filename, 'Failed');
          setUploadingFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(filename);
            return newSet;
          });
          throw error; // Re-throw to let the caller handle the final failure
        }
      }
    }
  };

  // Start the upload process for all files (sequential)
  const startUploadProcess = async (files: File[]): Promise<void> => {
    if (!jobData?.content_pipeline_files) {
      console.log('startUploadProcess: No content_pipeline_files found');
      return;
    }
    
    console.log('🚀 Starting sequential upload process for files:', files.map(f => f.name));
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
    
    // Upload files sequentially
    for (const { groupFilename, filename, file, fileInfo } of filesToUpload) {
      try {
        await uploadSingleFile(groupFilename, filename, file, fileInfo);
        uploadedCount++;
        
        // Update overall progress
        const overallProgress = (uploadedCount / filesToUpload.length) * 100;
        console.log(`Overall progress: ${Math.round(overallProgress)}% (${uploadedCount}/${filesToUpload.length})`);
        
      } catch (error) {
        failedCount++;
        console.error(`Failed to upload ${filename} after all retries:`, error);
      }
    }
    
         // Log results without updating job status (to avoid overwriting file statuses)
     if (failedCount === 0) {
       console.log('✅ All files uploaded successfully');
     } else if (uploadedCount > 0) {
       console.log(`⚠️ Upload completed with ${failedCount} failures out of ${filesToUpload.length} files`);
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

  const getJobDisplayName = () => {
    if (!jobData?.job_id) return 'Unknown Job';
    return jobData.job_id;
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
        title={`Job Details: ${getJobDisplayName()}`}
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
            
            {/* Job Overview */}
            <div style={{ marginBottom: 32 }}>
              <h1 style={{
                fontSize: '2rem',
                fontWeight: 600,
                color: '#f8f8f8',
                marginBottom: 24
              }}>
                📋 Job Overview
              </h1>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: 16,
                marginBottom: 24
              }}>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <h3 style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 8px 0' }}>Status</h3>
                  <p style={{ 
                    color: getStatusColor(jobData.job_status || ''), 
                    fontSize: 16, 
                    margin: 0,
                    fontWeight: 600 
                  }}>
                    {jobData.job_status || 'Unknown'}
                  </p>
                </div>
                
                <div style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <h3 style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 8px 0' }}>App</h3>
                  <p style={{ color: '#f8f8f8', fontSize: 16, margin: 0, fontWeight: 600 }}>
                    {jobData.app_name || 'Unknown'}
                  </p>
                </div>

                <div style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <h3 style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 8px 0' }}>Release</h3>
                  <p style={{ color: '#f8f8f8', fontSize: 16, margin: 0 }}>
                    {jobData.release_name || 'Unknown'}
                  </p>
                </div>

                <div style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <h3 style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 8px 0' }}>Subset</h3>
                  <p style={{ color: '#f8f8f8', fontSize: 16, margin: 0 }}>
                    {jobData.Subset_name || 'Unknown'}
                  </p>
                </div>
                
                {jobData.psd_file && (
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: 16,
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <h3 style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 8px 0' }}>PSD Template</h3>
                    <p style={{ color: '#f8f8f8', fontSize: 16, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>🎨</span>
                      <span>{jobData.psd_file}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>



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
                      {jobData.job_status === 'Upload in progress' || jobData.job_status === 'Upload started' 
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
                                          background: fileInfo.status === 'Uploaded' 
                                            ? 'rgba(16, 185, 129, 0.2)' 
                                            : fileInfo.status === 'Failed'
                                            ? 'rgba(239, 68, 68, 0.2)'
                                            : 'rgba(249, 115, 22, 0.2)',
                                          color: fileInfo.status === 'Uploaded' 
                                            ? '#34d399' 
                                            : fileInfo.status === 'Failed'
                                            ? '#fca5a5'
                                            : '#fdba74'
                                        }}>
                                          {fileInfo.status}
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
                            {file.extracted_files && file.extracted_files.length > 0 && (
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
                                    🖼️ Extracted Layers ({file.extracted_files.length})
                                  </h4>
                                  <button
                                    onClick={() => {
                                      // Collect file paths from extracted files
                                      const filePaths = file.extracted_files?.map(extractedFile => {
                                        const isObject = typeof extractedFile !== 'string';
                                        return isObject ? (extractedFile as ExtractedFile).file_path : extractedFile;
                                      }).filter(path => path) || [];
                                      
                                      const baseName = file.filename.replace('.pdf', '').replace('.PDF', '');
                                      const fullJobPath = router.query.jobPath as string;
                                      
                                      // Pass the file paths as a query parameter
                                      const filePathsParam = encodeURIComponent(JSON.stringify(filePaths));
                                      router.push(`/job/preview?jobPath=${encodeURIComponent(fullJobPath)}&fileName=${encodeURIComponent(baseName)}&type=extracted&filePaths=${filePathsParam}`);
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
                                </div>
                                <div style={{
                                  background: 'rgba(59, 130, 246, 0.1)',
                                  border: '1px solid rgba(59, 130, 246, 0.3)',
                                  borderRadius: 8,
                                  padding: 12,
                                  maxHeight: 200,
                                  overflowY: 'auto'
                                }}>
                                  {file.extracted_files.map((extractedFile, extIndex) => {
                                    const isObject = typeof extractedFile !== 'string';
                                    const fileObj = isObject ? extractedFile as ExtractedFile : null;
                                    const fileName = isObject ? fileObj?.filename || 'Unknown file' : extractedFile;
                                    
                                    return (
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
                                          <span>{fileName}</span>
                                        </span>
                                        {isObject && fileObj && fileObj.layer_type && (
                                          <span style={{ 
                                            background: 'rgba(59, 130, 246, 0.2)', 
                                            padding: '2px 6px', 
                                            borderRadius: 4,
                                            color: '#60a5fa',
                                            fontSize: 11
                                          }}>
                                            {fileObj.layer_type}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Firefly Assets - Only show if there are firefly assets */}
                          {file.firefly_assets && file.firefly_assets.length > 0 && (
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
                                  🎨 Firefly Assets ({file.firefly_assets.length})
                                </h4>
                                <button
                                  onClick={() => {
                                    // Use the actual file paths from firefly assets
                                    const filePaths = file.firefly_assets?.map(asset => asset.file_path || asset.filename).filter(path => path) || [];
                                    
                                    const baseName = file.filename.replace('.pdf', '').replace('.PDF', '');
                                    const fullJobPath = router.query.jobPath as string;
                                    
                                    // Pass the file paths as a query parameter
                                    const filePathsParam = encodeURIComponent(JSON.stringify(filePaths));
                                    router.push(`/job/preview?jobPath=${encodeURIComponent(fullJobPath)}&fileName=${encodeURIComponent(baseName)}&type=firefly&filePaths=${filePathsParam}`);
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
                              </div>
                              <div style={{
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                borderRadius: 8,
                                padding: 12
                              }}>
                                {file.firefly_assets.map((asset, assetIndex) => (
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
                                      <span>{asset.filename}</span>
                                    </span>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                      {asset.status && (
                                        <span style={{
                                          fontSize: 11,
                                          padding: '2px 6px',
                                          borderRadius: 4,
                                          background: asset.status.toLowerCase().includes('succeed') 
                                            ? 'rgba(16, 185, 129, 0.2)' 
                                            : asset.status.toLowerCase().includes('fail')
                                            ? 'rgba(239, 68, 68, 0.2)'
                                            : 'rgba(249, 115, 22, 0.2)',
                                          color: asset.status.toLowerCase().includes('succeed') 
                                            ? '#34d399' 
                                            : asset.status.toLowerCase().includes('fail')
                                            ? '#fca5a5'
                                            : '#fdba74'
                                        }}>
                                          {asset.status}
                                        </span>
                                      )}
                                      {(asset.spot_number || asset.color_variant) && (
                                        <div style={{ display: 'flex', gap: 4, fontSize: 11 }}>
                                          {asset.spot_number && (
                                            <span style={{ 
                                              background: 'rgba(16, 185, 129, 0.2)', 
                                              padding: '2px 6px', 
                                              borderRadius: 4 
                                            }}>
                                              Spot {asset.spot_number}
                                            </span>
                                          )}
                                          {asset.color_variant && (
                                            <span style={{ 
                                              background: 'rgba(16, 185, 129, 0.2)', 
                                              padding: '2px 6px', 
                                              borderRadius: 4 
                                            }}>
                                              {asset.color_variant}
                                            </span>
                                          )}
                                        </div>
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
                        No files available yet.
                      </div>
                    )}
                  </div>
                )}
              </div>

          </div>
        </main>
      </div>

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
        
        .uploading-text {
          animation: pulse 2s infinite;
        }
      `}</style>
    </div>
  );
} 