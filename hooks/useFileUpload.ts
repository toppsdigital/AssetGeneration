'use client';

import { useState, useCallback } from 'react';
import { contentPipelineApi } from '../web/utils/contentPipelineApi';

interface UseFileUploadReturn {
  uploadProgress: Record<string, number>;
  uploadingFiles: Set<string>;
  totalPdfFiles: number;
  uploadedPdfFiles: number;
  failedPdfFiles: number;
  uploadStarted: boolean;
  allFilesUploaded: boolean;
  
  // Actions
  setUploadProgress: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setUploadingFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  setTotalPdfFiles: React.Dispatch<React.SetStateAction<number>>;
  setUploadedPdfFiles: React.Dispatch<React.SetStateAction<number>>;
  setFailedPdfFiles: React.Dispatch<React.SetStateAction<number>>;
  setUploadStarted: React.Dispatch<React.SetStateAction<boolean>>;
  setAllFilesUploaded: React.Dispatch<React.SetStateAction<boolean>>;
  
  // Upload operations
  getPresignedUrl: (filePath: string) => Promise<string>;
  uploadFileToS3: (file: File, uploadUrl: string, onProgress?: (progress: number) => void) => Promise<void>;
  updateLocalFileStatus: (groupFilename: string, pdfFilename: string, status: 'uploading' | 'uploaded' | 'upload-failed') => void;
  uploadSingleFile: (groupFilename: string, filename: string, file: File, fileInfo: any, maxRetries?: number) => Promise<void>;
  startUploadProcess: (files: File[], jobData: any, setJobData: any) => Promise<void>;
}

export const useFileUpload = (): UseFileUploadReturn => {
  // Upload state
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [uploadStarted, setUploadStarted] = useState(false);
  const [allFilesUploaded, setAllFilesUploaded] = useState(false);

  // Upload counters
  const [totalPdfFiles, setTotalPdfFiles] = useState(0);
  const [uploadedPdfFiles, setUploadedPdfFiles] = useState(0);
  const [failedPdfFiles, setFailedPdfFiles] = useState(0);

  // Get pre-signed URL for uploading files
  const getPresignedUrl = useCallback(async (filePath: string): Promise<string> => {
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
  }, []);

  // Upload file using pre-signed URL by proxying through our backend
  const uploadFileToS3 = useCallback(async (file: File, uploadUrl: string, onProgress?: (progress: number) => void): Promise<void> => {
    try {
      console.log('📤 Starting proxied upload for:', file.name, 'to /api/s3-upload');

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
  }, []);

  // Simplified local file status update (optimistic UI update)
  const updateLocalFileStatus = useCallback((
    groupFilename: string,
    pdfFilename: string,
    status: 'uploading' | 'uploaded' | 'upload-failed'
  ): void => {
    console.log('📱 Updating local file status:', pdfFilename, 'to', status);
    
    // Update counters based on status
    if (status === 'uploaded') {
      setUploadedPdfFiles(prev => prev + 1);
      console.log('✅ PDF uploaded successfully:', pdfFilename);
    } else if (status === 'upload-failed') {
      setFailedPdfFiles(prev => prev + 1);
      console.log('❌ PDF upload failed:', pdfFilename);
    }
  }, []);

  // Helper function to wait for a specified time
  const wait = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  // Upload a single file with retry logic and improved tracking
  const uploadSingleFile = useCallback(async (
    groupFilename: string, 
    filename: string, 
    file: File, 
    fileInfo: any, 
    maxRetries: number = 3
  ): Promise<void> => {
    let retryCount = 0;
    
    // Track this file as actively uploading (for UI progress)
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
        console.log('📁 File path:', fileInfo.file_path);
        
        // Get pre-signed URL
        const uploadUrl = await getPresignedUrl(fileInfo.file_path);
        
        // Upload file with progress tracking
        await uploadFileToS3(file, uploadUrl, (progress) => {
          setUploadProgress(prev => ({
            ...prev,
            [filename]: progress
          }));
        });
        
        // File uploaded successfully - update local status immediately
        console.log(`✅ File ${filename} successfully uploaded to S3`);
        updateLocalFileStatus(groupFilename, filename, 'uploaded');

        // Clear upload progress for this file
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[filename];
          console.log('🧹 Cleared upload progress for', filename);
          return newProgress;
        });
        
        // Remove from uploading set immediately (S3 upload completed)
        setUploadingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(filename);
          console.log(`🗑️ Removed ${filename} from uploadingFiles set. Remaining files:`, Array.from(newSet));
          return newSet;
        });
        
        return; // Success, exit the retry loop
        
      } catch (error) {
        retryCount++;
        console.error(`Failed to upload ${filename} (attempt ${retryCount}/${maxRetries}):`, error);
        
        if (retryCount < maxRetries) {
          console.log(`Retrying upload of ${filename} in 1.5 seconds...`);
          await wait(1500);
        } else {
          // All retries failed - mark as failed
          console.error('All retry attempts failed for', filename);
          updateLocalFileStatus(groupFilename, filename, 'upload-failed');
          
          // Remove from uploading set on final failure
          setUploadingFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(filename);
            console.log(`❌ Removed failed ${filename} from uploadingFiles set. Remaining files:`, Array.from(newSet));
            return newSet;
          });
          
          throw error; // Re-throw to let the caller handle the final failure
        }
      }
    }
  }, [getPresignedUrl, uploadFileToS3, updateLocalFileStatus]);

  // Start the upload process for all files (parallel batches of 4)
  const startUploadProcess = useCallback(async (files: File[], jobData: any, setJobData: any): Promise<void> => {
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
    
    jobData.content_pipeline_files.forEach((fileObj: any) => {
      if (fileObj.original_files) {
        Object.entries(fileObj.original_files).forEach(([filename, fileInfo]: [string, any]) => {
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
    setTotalPdfFiles(totalFiles);
    setUploadedPdfFiles(0);
    setFailedPdfFiles(0);
    
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
    
    console.log('🎉 Upload process completed! Total files:', totalFiles);
  }, [uploadSingleFile]);

  return {
    uploadProgress,
    uploadingFiles,
    totalPdfFiles,
    uploadedPdfFiles,
    failedPdfFiles,
    uploadStarted,
    allFilesUploaded,
    
    setUploadProgress,
    setUploadingFiles,
    setTotalPdfFiles,
    setUploadedPdfFiles,
    setFailedPdfFiles,
    setUploadStarted,
    setAllFilesUploaded,
    
    getPresignedUrl,
    uploadFileToS3,
    updateLocalFileStatus,
    uploadSingleFile,
    startUploadProcess
  };
}; 