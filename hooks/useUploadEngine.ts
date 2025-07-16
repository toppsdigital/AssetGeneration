'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { contentPipelineApi, JobData, FileData } from '../web/utils/contentPipelineApi';
import { useQueryClient } from '@tanstack/react-query';
import { jobKeys } from '../web/hooks/useJobData';

interface UseUploadEngineProps {
  jobData: any;
  setJobData?: (updater: (prev: any) => any) => void;
  onUploadComplete?: () => void;
}

interface UseUploadEngineReturn {
  // State
  uploadProgress: Record<string, number>;
  uploadingFiles: Set<string>;
  totalPdfFiles: number;
  uploadedPdfFiles: number;
  failedPdfFiles: number;
  uploadStarted: boolean;
  allFilesUploaded: boolean;
  
  // Actions
  setUploadStarted: React.Dispatch<React.SetStateAction<boolean>>;
  resetUploadState: () => void;
  
  // Upload operations
  checkAndStartUpload: (filesLoaded: boolean) => Promise<void>;
  startUploadProcess: (files: File[]) => Promise<void>;
  updateFileStatus: (groupFilename: string, pdfFilename: string, status: 'uploading' | 'uploaded' | 'upload-failed') => Promise<void>;
}

export const useUploadEngine = ({ 
  jobData, 
  setJobData, 
  onUploadComplete 
}: UseUploadEngineProps): UseUploadEngineReturn => {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  // Upload state
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [uploadStarted, setUploadStarted] = useState(false);
  const [allFilesUploaded, setAllFilesUploaded] = useState(false);

  // Upload counters
  const [totalPdfFiles, setTotalPdfFiles] = useState(0);
  const [uploadedPdfFiles, setUploadedPdfFiles] = useState(0);
  const [failedPdfFiles, setFailedPdfFiles] = useState(0);

  // Reset upload state
  const resetUploadState = useCallback(() => {
    setUploadProgress({});
    setUploadingFiles(new Set());
    setUploadStarted(false);
    setAllFilesUploaded(false);
    setTotalPdfFiles(0);
    setUploadedPdfFiles(0);
    setFailedPdfFiles(0);
  }, []);

  // Helper function to wait
  const wait = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  // Get pre-signed URL for uploading files
  const getPresignedUrl = useCallback(async (filePath: string): Promise<string> => {
    try {
      console.log('🔗 Getting presigned URL for:', filePath);
      
      const requestBody = { 
        filename: filePath,
        client_method: 'put',
        expires_in: 720
      };
      
      const response = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Failed to get pre-signed URL: ${response.statusText} - ${JSON.stringify(errorData)}`);
      }
      
      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error('❌ Error getting pre-signed URL:', error);
      throw error;
    }
  }, []);

  // Upload file using pre-signed URL
  const uploadFileToS3 = useCallback(async (
    file: File, 
    uploadUrl: string, 
    onProgress?: (progress: number) => void
  ): Promise<void> => {
    try {
      console.log('📤 Starting proxied upload for:', file.name);

      const response = await fetch('/api/s3-upload', {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/pdf',
          'x-presigned-url': uploadUrl,
        },
        body: file,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed with status ${response.status}: ${errorText}`);
      }

      console.log('✅ Proxied upload completed for', file.name);
      onProgress?.(100);
    } catch (error) {
      console.error(`❌ Proxied upload failed for ${file.name}:`, error);
      throw error;
    }
  }, []);

  // Update file status with backend sync
  const updateFileStatus = useCallback(async (
    groupFilename: string,
    pdfFilename: string,
    status: 'uploading' | 'uploaded' | 'upload-failed'
  ): Promise<void> => {
    if (!jobData?.content_pipeline_files) return;

    console.log('🔄 Updating status for', pdfFilename, 'in group', groupFilename, 'to', status);

    try {
      // Update backend first - single source of truth
      const response = await contentPipelineApi.updatePdfFileStatus(groupFilename, pdfFilename, status);

      if (!response?.file?.original_files) {
        throw new Error('Backend response missing file property');
      }

      // Update local state with backend response
      if (setJobData) {
        setJobData(prev => {
          if (!prev?.content_pipeline_files) return prev;
          
          const updatedFiles = prev.content_pipeline_files.map((file: any) =>
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
          
          return { ...prev, content_pipeline_files: updatedFiles };
        });
      }

      // Also update React Query cache if available
      if (jobData.job_id) {
        const cachedData = queryClient.getQueryData(jobKeys.detail(jobData.job_id));
        if (cachedData) {
          queryClient.setQueryData(jobKeys.detail(jobData.job_id), (prev: any) => {
            if (!prev?.content_pipeline_files) return prev;
            
            const updatedFiles = prev.content_pipeline_files.map((file: any) =>
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
            
            return { ...prev, content_pipeline_files: updatedFiles };
          });
        }
      }
      
      console.log('✅ Backend and local state synced for', groupFilename);
      
    } catch (error) {
      console.error(`❌ Failed to update ${pdfFilename} status in backend:`, error);
      throw error;
    }
  }, [jobData, setJobData, queryClient]);

  // Local file status update (optimistic UI)
  const updateLocalFileStatus = useCallback((
    groupFilename: string,
    pdfFilename: string,
    status: 'uploading' | 'uploaded' | 'upload-failed'
  ): void => {
    console.log('📱 Updating local file status:', pdfFilename, 'to', status);
    
    if (setJobData) {
      setJobData(prev => {
        if (!prev?.content_pipeline_files) return prev;
        
        const updatedFiles = prev.content_pipeline_files.map((file: any) =>
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
    }
    
    // Update counters
    if (status === 'uploaded') {
      setUploadedPdfFiles(prev => prev + 1);
      console.log('✅ PDF uploaded successfully:', pdfFilename);
    } else if (status === 'upload-failed') {
      setFailedPdfFiles(prev => prev + 1);
      console.log('❌ PDF upload failed:', pdfFilename);
    }
  }, [setJobData]);

  // Upload a single file with retry logic
  const uploadSingleFile = useCallback(async (
    groupFilename: string, 
    filename: string, 
    file: File, 
    fileInfo: any, 
    maxRetries: number = 3
  ): Promise<void> => {
    let retryCount = 0;
    
    // Track this file as actively uploading
    setUploadingFiles(prev => {
      const newSet = new Set(prev).add(filename);
      console.log(`📤 Added ${filename} to uploadingFiles set. Current files:`, Array.from(newSet));
      return newSet;
    });
    
    // Set initial uploading status
    updateLocalFileStatus(groupFilename, filename, 'uploading');
    
    while (retryCount < maxRetries) {
      try {
        console.log('🔄 Uploading', filename, '(attempt', retryCount + 1 + '/' + maxRetries + ')');
        
        // Get pre-signed URL
        const uploadUrl = await getPresignedUrl(fileInfo.file_path);
        
        // Upload file with progress tracking
        await uploadFileToS3(file, uploadUrl, (progress) => {
          setUploadProgress(prev => ({
            ...prev,
            [filename]: progress
          }));
        });
        
        // File uploaded successfully
        console.log(`✅ File ${filename} successfully uploaded to S3`);
        updateLocalFileStatus(groupFilename, filename, 'uploaded');

        // Clear upload progress
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[filename];
          return newProgress;
        });
        
        // Remove from uploading set
        setUploadingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(filename);
          console.log(`🗑️ Removed ${filename} from uploadingFiles set. Remaining:`, Array.from(newSet));
          return newSet;
        });
        
        return; // Success
        
      } catch (error) {
        retryCount++;
        console.error(`Failed to upload ${filename} (attempt ${retryCount}/${maxRetries}):`, error);
        
        if (retryCount < maxRetries) {
          console.log(`Retrying upload of ${filename} in 1.5 seconds...`);
          await wait(1500);
        } else {
          // All retries failed
          console.error('All retry attempts failed for', filename);
          updateLocalFileStatus(groupFilename, filename, 'upload-failed');
          
          // Remove from uploading set
          setUploadingFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(filename);
            console.log(`❌ Removed failed ${filename} from uploadingFiles set. Remaining:`, Array.from(newSet));
            return newSet;
          });
          
          throw error;
        }
      }
    }
  }, [getPresignedUrl, uploadFileToS3, updateLocalFileStatus]);

  // Start the upload process for all files
  const startUploadProcess = useCallback(async (files: File[]): Promise<void> => {
    if (!jobData?.content_pipeline_files) {
      console.log('startUploadProcess: No content_pipeline_files found');
      return;
    }
    
    console.log('🚀 Starting upload process for files:', files.map(f => f.name));
    
    // Create file mapping
    const fileMap = new Map<string, File>();
    files.forEach(file => fileMap.set(file.name, file));
    
    // Collect files to upload
    const filesToUpload: Array<{groupFilename: string, filename: string, file: File, fileInfo: any}> = [];
    
    jobData.content_pipeline_files.forEach((fileObj: any) => {
      if (fileObj.original_files) {
        Object.entries(fileObj.original_files).forEach(([filename, fileInfo]: [string, any]) => {
          const file = fileMap.get(filename);
          if (file) {
            filesToUpload.push({ groupFilename: fileObj.filename, filename, file, fileInfo });
          }
        });
      }
    });
    
    // Set totals and reset counters
    const totalFiles = filesToUpload.length;
    console.log('📊 Total PDF files to upload:', totalFiles);
    setTotalPdfFiles(totalFiles);
    setUploadedPdfFiles(0);
    setFailedPdfFiles(0);
    
    const batchSize = 4;
    
    // Process in batches
    for (let i = 0; i < filesToUpload.length; i += batchSize) {
      const batch = filesToUpload.slice(i, i + batchSize);
      console.log('📦 Processing batch', Math.floor(i / batchSize) + 1, ':', batch.map(b => b.filename));
      
      // Upload batch in parallel
      const batchPromises = batch.map(async ({ groupFilename, filename, file, fileInfo }) => {
        try {
          await uploadSingleFile(groupFilename, filename, file, fileInfo);
          return { success: true, filename };
        } catch (error) {
          console.error(`Failed to upload ${filename}:`, error);
          return { success: false, filename };
        }
      });
      
      await Promise.allSettled(batchPromises);
      
      // Small delay between batches
      if (i + batchSize < filesToUpload.length) {
        await wait(300);
      }
    }
    
    console.log('🎉 Upload process completed!');
  }, [jobData, uploadSingleFile]);

  // Check for files that need uploading and start process
  const checkAndStartUpload = useCallback(async (filesLoaded: boolean): Promise<void> => {
    if (!filesLoaded || !jobData?.content_pipeline_files || uploadStarted) {
      return;
    }

    console.log('✅ Files loaded, checking for uploads...');
    
    // Collect files with "uploading" status
    const filesToUpload: { filename: string; filePath: string }[] = [];
    
    jobData.content_pipeline_files.forEach((fileGroup: any) => {
      if (fileGroup.original_files) {
        Object.entries(fileGroup.original_files).forEach(([filename, fileInfo]: [string, any]) => {
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

    // Check for pending files from new job creation
    const pendingFiles = (window as any).pendingUploadFiles;
    if (pendingFiles && pendingFiles.jobId === jobData.job_id && pendingFiles.files) {
      console.log('🚀 Starting upload with files from new job creation...');
      
      const matchedFiles = pendingFiles.files.filter((file: File) =>
        filesToUpload.some(needed => needed.filename === file.name)
      );
      
      if (matchedFiles.length > 0) {
        setUploadStarted(true);
        await startUploadProcess(matchedFiles);
      }
    } else {
      console.log('⚠️ Files need uploading but no File objects available');
    }
  }, [jobData, uploadStarted, startUploadProcess]);

  // Monitor upload completion
  useEffect(() => {
    if (!jobData?.content_pipeline_files || allFilesUploaded) {
      return;
    }

    const checkUploadStatus = () => {
      const allFilesProcessed = totalPdfFiles > 0 && (uploadedPdfFiles + failedPdfFiles) === totalPdfFiles;
      const noActiveUploads = uploadingFiles.size === 0;
      const hasUploads = uploadedPdfFiles > 0;
      const isComplete = allFilesProcessed && noActiveUploads && hasUploads;
      
      console.log('📊 Upload status check:', uploadedPdfFiles + '/' + totalPdfFiles, 'uploaded,', failedPdfFiles, 'failed');
      
      if (isComplete && !allFilesUploaded) {
        console.log('✅ Upload completed! Calling completion handler...');
        setAllFilesUploaded(true);
        
        // Call completion callback or navigate
        if (onUploadComplete) {
          onUploadComplete();
        } else {
          // Default navigation after delay
          setTimeout(() => {
            router.push('/jobs');
          }, 1500);
        }
      }
    };

    checkUploadStatus();
    const interval = setInterval(checkUploadStatus, 500);
    return () => clearInterval(interval);
  }, [jobData, uploadingFiles, allFilesUploaded, totalPdfFiles, uploadedPdfFiles, failedPdfFiles, onUploadComplete, router]);

  return {
    // State
    uploadProgress,
    uploadingFiles,
    totalPdfFiles,
    uploadedPdfFiles,
    failedPdfFiles,
    uploadStarted,
    allFilesUploaded,
    
    // Actions
    setUploadStarted,
    resetUploadState,
    
    // Upload operations
    checkAndStartUpload,
    startUploadProcess,
    updateFileStatus
  };
}; 