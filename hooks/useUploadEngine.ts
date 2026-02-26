'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { JobData, FileData, contentPipelineApi } from '../web/utils/contentPipelineApi';
import { useQueryClient } from '@tanstack/react-query';
import { useAppDataStore } from './useAppDataStore';
import { buildS3UploadsPath, isInUploadsDirectory } from '../utils/environment';

interface UseUploadEngineProps {
  jobData: any;
  createdFiles?: any[]; // Optional - if provided, use these instead of jobData.content_pipeline_files
  setJobData?: (updater: (prev: any) => any) => void;
  onUploadComplete?: () => void;
  onFileStatusChange?: (filename: string, status: string) => void; // Callback for real-time status updates
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
  createdFiles, 
  setJobData, 
  onUploadComplete,
  onFileStatusChange 
}: UseUploadEngineProps): UseUploadEngineReturn => {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  // Use centralized data store for PDF file status operations
  const { mutate: fileStatusMutation } = useAppDataStore('jobFiles', { 
    jobId: jobData?.job_id || '', 
    autoRefresh: false 
  });
  
  // Upload state
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [uploadStarted, setUploadStarted] = useState(false);
  const [allFilesUploaded, setAllFilesUploaded] = useState(false);

  // Upload counters
  const [totalPdfFiles, setTotalPdfFiles] = useState(0);
  const [uploadedPdfFiles, setUploadedPdfFiles] = useState(0);
  const [failedPdfFiles, setFailedPdfFiles] = useState(0);

  // Debug uploadStarted state changes (after state declarations)
  useEffect(() => {
    console.log('🔄 uploadStarted state changed:', uploadStarted);
    if (uploadStarted) {
      console.log('📍 uploadStarted set to true - current context:', {
        totalPdfFiles,
        uploadedPdfFiles,
        uploadingFilesCount: uploadingFiles.size,
        hasJobData: !!jobData,
        hasCreatedFiles: createdFiles?.length || 0
      });
      console.trace('📍 Stack trace for uploadStarted = true');
    }
  }, [uploadStarted, totalPdfFiles, uploadedPdfFiles, uploadingFiles.size]);

  // Initialize counters from files when available
  useEffect(() => {
    // Use createdFiles if provided, otherwise fall back to jobData.content_pipeline_files
    const filesToCheck = createdFiles && createdFiles.length > 0 ? createdFiles : jobData?.content_pipeline_files;
    
    if (!filesToCheck) {
      console.log('📊 No files available for counter initialization');
      return;
    }

    let totalFiles = 0;
    let uploadedFiles = 0;
    let failedFiles = 0;

    filesToCheck.forEach((fileGroup: any) => {
      if (fileGroup.original_files) {
        Object.entries(fileGroup.original_files).forEach(([filename, fileInfo]: [string, any]) => {
          totalFiles++;
          if (fileInfo.status === 'uploaded') {
            uploadedFiles++;
          } else if (fileInfo.status === 'upload-failed') {
            failedFiles++;
          }
        });
      }
    });

    console.log('📊 Initializing upload counters:', {
      totalFiles,
      uploadedFiles,
      failedFiles,
      jobId: jobData?.job_id,
      usingCreatedFiles: !!(createdFiles && createdFiles.length > 0),
      currentUploadStarted: uploadStarted
    });

    // Note: uploadStarted is now only used for progress display, not flow control

    setTotalPdfFiles(totalFiles);
    setUploadedPdfFiles(uploadedFiles);
    setFailedPdfFiles(failedFiles);
  }, [createdFiles, jobData?.content_pipeline_files, jobData?.job_id, uploadStarted, totalPdfFiles]);

  // Reset upload state
  const resetUploadState = useCallback(() => {
    setUploadProgress({});
    setUploadingFiles(new Set());
    setUploadStarted(false);
    setAllFilesUploaded(false);
    setTotalPdfFiles(0);
    setUploadedPdfFiles(0);
    setFailedPdfFiles(0);
    uploadMonitoringStartTime.current = null; // Reset monitoring timer
    console.log('🔄 Upload state reset - cleared all counters and monitoring timer');
  }, []);

  // Helper function to wait
  const wait = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  // Web Worker for background base64 conversion
  const workerRef = useRef<Worker | null>(null);
  const conversionPromises = useRef<Map<string, { resolve: (value: string) => void; reject: (error: Error) => void }>>(new Map());

  // Initialize Web Worker
  useEffect(() => {
    if (typeof Worker !== 'undefined') {
      workerRef.current = new Worker('/base64-worker.js');
      
      workerRef.current.onmessage = (e) => {
        const { id, success, base64Content, error, fileName } = e.data;
        const promise = conversionPromises.current.get(id);
        
        if (promise) {
          if (success) {
            promise.resolve(base64Content);
          } else {
            promise.reject(new Error(`Base64 conversion failed for ${fileName}: ${error}`));
          }
          conversionPromises.current.delete(id);
        }
      };
      
      workerRef.current.onerror = (error) => {
        console.error('Web Worker error:', error);
        // Reject all pending promises
        conversionPromises.current.forEach(({ reject }) => {
          reject(new Error('Web Worker error'));
        });
        conversionPromises.current.clear();
      };
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      conversionPromises.current.clear();
    };
  }, []);

  // Convert file to base64 using Web Worker
  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        // Fallback to main thread if Web Worker not available
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = error => reject(error);
        return;
      }

      const id = `${Date.now()}-${Math.random()}`;
      conversionPromises.current.set(id, { resolve, reject });
      
      // Send file to Web Worker for conversion
      workerRef.current.postMessage({
        id,
        file,
        fileName: file.name
      });
    });
  }, []);

  // Upload files directly to S3 using presigned URL (single-part)
  const uploadFilesToContentPipeline = useCallback(async (
    files: Array<{ file: File; filePath: string }>
  ): Promise<void> => {
    try {
      console.log('📤 Starting direct-to-S3 upload for', files.length, 'files');
      
      const uploadedFiles = [];
      
      for (const { file, filePath } of files) {
        console.log(`📤 Uploading file direct to S3: ${filePath} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        
        // Step 1: Get presigned PUT URL via content pipeline
        const s3Key = filePath; // Use filePath directly (e.g., "BUNT/PDFs/25BWBB_3501_BK.pdf")
        console.log(`🔑 Content Pipeline S3 upload - using s3Key: "${s3Key}"`);
        
        const presignedData = await contentPipelineApi.getPresignedUrl({
          client_method: 'put',
          filename: s3Key,
          expires_in: 3600,
          size: file.size,
          content_type: file.type || 'application/pdf'
        });

        // If backend returned multipart instructions, use multipart uploader
        if (presignedData.upload_type === 'multipart' && presignedData.upload_data?.part_urls) {
          console.log('🔀 Switching to multipart upload path for large file');
          await uploadLargeFileToS3(file, filePath, {
            upload_type: 'multipart',
            upload_data: presignedData.upload_data,
            s3_key: presignedData.s3_key
          });
          uploadedFiles.push({ filename: filePath, s3_key: s3Key });
          console.log(`✅ Successfully uploaded via multipart: ${filePath}`);
          continue;
        }

        const presignedUrl = presignedData.url;
        
        // Step 2: Upload file to S3 via server-side proxy to avoid CORS issues
        if (presignedData.fields && presignedData.method === 'POST') {
          console.log(`📤 Using proxied presigned POST with ${Object.keys(presignedData.fields).length} fields`);
          const resp = await fetch('/api/s3-upload', {
            method: 'POST',
            headers: {
              'Content-Type': file.type || 'application/pdf',
              'x-upload-url': presignedUrl,
              'x-upload-fields': JSON.stringify(presignedData.fields),
              'x-upload-method': 'POST',
            },
            body: file,
          });
          if (!resp.ok) {
            const txt = await resp.text();
            throw new Error(`S3 POST failed: ${resp.status} ${txt}`);
          }
        } else {
          console.log(`📤 Using proxied presigned PUT`);
          const resp = await fetch('/api/s3-upload', {
            method: 'PUT',
            headers: {
              'Content-Type': file.type || 'application/pdf',
              'x-presigned-url': presignedUrl,
            },
            body: file,
          });
          if (!resp.ok) {
            const txt = await resp.text();
            throw new Error(`S3 PUT failed: ${resp.status} ${txt}`);
          }
        }

        uploadedFiles.push({ filename: filePath, s3_key: s3Key });
        console.log(`✅ Successfully uploaded direct to S3: ${filePath}`);
      }
      
      console.log('✅ All files uploaded successfully direct to S3');
      // Note: File status updates are handled via useAppDataStore mutations, 
      // no need to manually notify Content Pipeline
    } catch (error) {
      console.error('❌ Direct S3 upload failed:', error);
      throw error;
    }
  }, [jobData]);

  // Upload large files using streaming S3 API  
  const uploadLargeFileToS3 = useCallback(async (
    file: File, 
    filePath: string, 
    uploadInstruction: any
  ): Promise<void> => {
    try {
      console.log(`📤 Starting streaming upload for large file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      
      // DEBUGGING: Log the uploadInstruction.s3_key that will be sent to S3 proxy
      console.log(`🔍 uploadLargeFileToS3 called with:`, {
        fileName: file.name,
        filePath: filePath,
        's3_key_from_instruction': uploadInstruction.s3_key,
        'instruction_has_unwanted_prefix': uploadInstruction.s3_key ? isInUploadsDirectory(uploadInstruction.s3_key) : false
      });
      
      let uploadResponse;
      
      if (uploadInstruction.upload_type === 'single') {
        // Single upload using presigned POST
        console.log('📤 Using single presigned POST upload');
        console.log('📤 Upload URL:', uploadInstruction.upload_data.url);
        console.log('📤 Upload method:', uploadInstruction.upload_data.method);
        console.log('📤 Upload fields:', uploadInstruction.upload_data.fields);
        
        const formData = new FormData();
        
        // Add all the required fields from the upload instructions
        Object.entries(uploadInstruction.upload_data.fields).forEach(([key, value]) => {
          console.log(`📤 Adding field: ${key} = ${value}`);
          formData.append(key, value as string);
        });
        // Add the file last (important for S3)
        formData.append('file', file);
        console.log('📤 FormData prepared, uploading to S3...');
        
        try {
          // Use content pipeline for presigned URL generation instead of old s3-proxy
          console.log('📤 Getting presigned URL via content pipeline');
          
          // Prefer the clean app path for presign: {APP}/PDFs/{file}
          let cleanKey = filePath;
          if (isInUploadsDirectory(cleanKey)) {
            const uploadsPrefix = buildS3UploadsPath('');
            cleanKey = cleanKey.replace(new RegExp(`^${uploadsPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '');
          }
          console.log(`🔍 Presign using clean key: "${cleanKey}" (was: ${uploadInstruction.s3_key})`);
          const presignedData = await contentPipelineApi.getPresignedUrl({
            client_method: 'put',
            filename: cleanKey,
            expires_in: 3600,
            size: file.size,
            content_type: file.type || 'application/pdf'
          });

          const presignedUrl = presignedData.url;
          
          // Use the appropriate upload method based on response
          if (presignedData.fields && presignedData.method === 'POST') {
            // Use form POST upload
            console.log(`📤 Using presigned POST form upload with ${Object.keys(presignedData.fields).length} fields`);
            uploadResponse = await fetch('/api/s3-upload', {
              method: 'POST',
              headers: {
                'Content-Type': file.type || 'application/pdf',
                'x-upload-url': presignedUrl,
                'x-upload-fields': JSON.stringify(presignedData.fields),
                'x-upload-method': presignedData.method,
              },
              body: file,
            });
          } else {
            // Use simple PUT upload (fallback)
            console.log(`📤 Using presigned PUT upload`);
            uploadResponse = await fetch('/api/s3-upload', {
              method: 'PUT',
              headers: {
                'Content-Type': file.type || 'application/pdf',
                'x-presigned-url': presignedUrl,
              },
              body: file,
            });
          }
          
          console.log('📤 S3 response status:', uploadResponse.status);
          console.log('📤 S3 response headers:', Object.fromEntries(uploadResponse.headers.entries()));
          
          if (!uploadResponse.ok) {
            const responseText = await uploadResponse.text();
            console.error('📤 S3 error response:', responseText);
            throw new Error(`S3 upload failed: ${uploadResponse.status} - ${responseText}`);
          }
        } catch (fetchError) {
          console.error('📤 Fetch error details:', fetchError);
          console.error('📤 Error name:', fetchError.name);
          console.error('📤 Error message:', fetchError.message);
          throw new Error(`Failed to upload to S3: ${fetchError.message}`);
        }
        
      } else if (uploadInstruction.upload_type === 'multipart') {
        // Multipart upload for very large files - proxy through server to avoid CORS
        console.log('📤 Using multipart upload (proxied)');
        const partETags = [];

        for (const partInfo of uploadInstruction.upload_data.part_urls) {
          const start = partInfo.size_range.start;
          const end = Math.min(partInfo.size_range.end + 1, file.size);
          const chunk = file.slice(start, end);

          console.log(`📤 Uploading part ${partInfo.part_number} (${start}-${end})`);

          const partResponse = await fetch('/api/s3-upload', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/octet-stream',
              'x-presigned-url': partInfo.url,
            },
            body: chunk,
          });

          if (!partResponse.ok) {
            const errorText = await partResponse.text();
            throw new Error(`Part ${partInfo.part_number} upload failed: ${partResponse.status} ${errorText}`);
          }

          // ETag is returned from the proxy response
          const proxyResult = await partResponse.json();
          let etag = (proxyResult.etag || '').trim();
          if (!etag) {
            throw new Error(`Missing ETag header for part ${partInfo.part_number}`);
          }
          if (!/^".*"$/.test(etag)) {
            etag = `"${etag}"`;
          }
          partETags.push({
            PartNumber: partInfo.part_number,
            ETag: etag
          });
        }

        // Complete multipart upload via proxy
        console.log('📤 Completing multipart upload (proxied)');
        const completeXML = `<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUpload>
${partETags.map(part => `  <Part><PartNumber>${part.PartNumber}</PartNumber><ETag>${part.ETag}</ETag></Part>`).join('\n')}
</CompleteMultipartUpload>`;

        uploadResponse = await fetch('/api/s3-upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/xml',
            'x-upload-url': uploadInstruction.upload_data.complete_url,
            'x-upload-method': 'POST',
            'x-multipart-complete': 'true',
          },
          body: completeXML,
        });
      }

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`S3 streaming upload failed: ${uploadResponse.status} ${errorText}`);
      }

      console.log(`✅ Large file uploaded successfully via streaming: ${file.name}`);
    } catch (error) {
      console.error(`❌ Large file streaming upload failed for ${file.name}:`, error);
      throw error;
    }
  }, []);

  // Update file status with backend sync
  const updateFileStatus = useCallback(async (
    groupFilename: string,
    pdfFilename: string,
    status: 'uploading' | 'processing' | 'uploaded' | 'upload-failed'
  ): Promise<void> => {
    if (!jobData?.content_pipeline_files) return;

    console.log('🔄 Updating status for', pdfFilename, 'in group', groupFilename, 'to', status);

    try {
      // Update backend first - single source of truth via centralized data store
      const response = await fileStatusMutation({
        type: 'updatePdfFileStatus',
        jobId: jobData.job_id, // Include jobId for proper cache updates
        fileId: groupFilename,
        data: {
          pdfFilename,
          status
        }
      });

      if (!response?.file?.original_files) {
        throw new Error('Backend response missing file property');
      }

      // useAppDataStore automatically handles all cache updates - no manual state needed
      console.log('✅ useAppDataStore automatically updated caches for file status change');
      
      console.log('✅ Backend and local state synced for', groupFilename);
      
    } catch (error) {
      console.error(`❌ Failed to update ${pdfFilename} status in backend:`, error);
      throw error;
    }
  }, [jobData, setJobData, queryClient]);

  // No local file status updates needed - useAppDataStore handles everything
  const updateLocalFileStatus = useCallback((
    groupFilename: string,
    pdfFilename: string,
    status: 'uploading' | 'processing' | 'uploaded' | 'upload-failed'
  ): void => {
    console.log('📱 File status update request:', pdfFilename, 'to', status, '(useAppDataStore will handle)');
    // useAppDataStore handles all file status updates automatically
  }, []);





  // Pre-convert files to base64 for pipeline optimization
  const preConvertBatch = useCallback(async (
    batch: Array<[string, Array<{filename: string, file: File, fileInfo: any}>]>
  ): Promise<Array<[string, Array<{filename: string, file: File, fileInfo: any, base64Content: string}>]>> => {
    console.log('🔄 Pre-converting batch to base64...');
    
    return await Promise.all(
      batch.map(async ([groupFilename, groupFiles]) => {
        const convertedFiles = await Promise.all(
          groupFiles.map(async (fileData) => ({
            ...fileData,
            base64Content: await fileToBase64(fileData.file)
          }))
        );
        return [groupFilename, convertedFiles] as [string, Array<{filename: string, file: File, fileInfo: any, base64Content: string}>];
      })
    );
  }, [fileToBase64]);

  // Upload file group using streaming approach
  const uploadPreConvertedFileGroup = useCallback(async (
    groupFilename: string,
    convertedFiles: Array<{filename: string, file: File, fileInfo: any, base64Content: string}>
  ): Promise<void> => {
    console.log(`🚀 Uploading file group ${groupFilename} with ${convertedFiles.length} PDFs using streaming approach`);
    
    // Set processing status for all files in group (UI feedback during base64 conversion)
    convertedFiles.forEach(({ filename }) => {
      console.log(`🔄 Setting ${filename} to processing status for UI`);
      // Notify UI of processing status (local UI only)
      if (onFileStatusChange) {
        onFileStatusChange(filename, 'processing');
      }
    });
    
    // Add small delay to make processing state visible
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Now transition to uploading status and add to uploadingFiles set
    convertedFiles.forEach(({ filename }) => {
      console.log(`📤 Adding ${filename} to uploadingFiles set and setting uploading status`);
      setUploadingFiles(prev => new Set(prev).add(filename));
      // Notify UI of uploading status (local UI only)
      if (onFileStatusChange) {
        onFileStatusChange(filename, 'uploading');
      }
    });
    
    // Update backend status to processing for all files in this group
    try {
      const processingUpdates = convertedFiles.map(({ filename }) => ({
        pdf_filename: filename,
        status: 'processing' as const
      }));
      
      await fileStatusMutation({
        type: 'batchUpdatePdfFileStatus',
        jobId: jobData.job_id,
        fileId: groupFilename,
        data: { pdfUpdates: processingUpdates }
      });
      
      console.log(`✅ Set processing status for ${convertedFiles.length} files in group ${groupFilename}`);
    } catch (error) {
      console.warn(`⚠️ Failed to set processing status for group ${groupFilename}:`, error);
      // Continue with upload even if status update fails
    }
    
    // Track files for cleanup - ensure they're always removed from uploadingFiles
    const filesToCleanup = convertedFiles.map(f => f.filename);
    
    try {
      // Prepare files for direct S3 proxy upload (consistent pathing like EDR)
      const filesToUpload = convertedFiles.map(({ file, fileInfo }) => ({
        file,
        filePath: fileInfo.file_path
      }));
      console.log(`📤 Starting direct uploads for group ${groupFilename} (${filesToUpload.length} files)`);
      await uploadFilesToContentPipeline(filesToUpload);
      console.log(`✅ All ${convertedFiles.length} files uploaded successfully for group ${groupFilename}`);

      console.log(`✅ File group ${groupFilename} streaming upload completed successfully (status updates now handled by S3 triggers)`);
      
      // Remove files from uploadingFiles set now that they're uploaded
      convertedFiles.forEach(({ filename }) => {
        console.log(`🗑️ Removing ${filename} from uploadingFiles set after successful upload`);
        setUploadingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(filename);
          return newSet;
        });
        // Notify UI of upload completion
        if (onFileStatusChange) {
          onFileStatusChange(filename, 'uploaded');
        }
      });
      
      console.log(`🔄 About to update upload counters for group ${groupFilename}...`);
      
      // Update counters (only once per group, not per file)
      setUploadedPdfFiles(prev => {
        const newCount = prev + convertedFiles.length;
        console.log(`📊 Counter update for group ${groupFilename}: ${prev} + ${convertedFiles.length} = ${newCount} uploaded files`);
        return newCount;
      });
      
      console.log(`✅ Upload counters updated for group ${groupFilename} (job counter updates now handled by S3 triggers)`);
      
    } catch (error) {
      console.error(`❌ Failed to upload file group ${groupFilename}:`, error);
      
      // Update backend status for all files in the group to failed with a single API call
      try {
        const pdfUpdates = convertedFiles.map(({ filename }) => ({
          pdf_filename: filename,
          status: 'upload-failed' as const
        }));
        
        const statusResponse = await fileStatusMutation({
          type: 'batchUpdatePdfFileStatus',
          jobId: jobData.job_id, // Include jobId for proper cache updates
          fileId: groupFilename,
          data: {
            pdfUpdates
          }
        });
        
        // useAppDataStore automatically handles cache updates
        console.log('✅ useAppDataStore automatically updated caches for failed file status change');
        
        console.log(`✅ Batch updated ${pdfUpdates.length} PDFs to 'upload-failed' status`);
        
        // Remove files from uploadingFiles set even on failure
        convertedFiles.forEach(({ filename }) => {
          console.log(`🗑️ Removing ${filename} from uploadingFiles set after failed upload`);
          setUploadingFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(filename);
            return newSet;
          });
          // Notify UI of upload failure
          if (onFileStatusChange) {
            onFileStatusChange(filename, 'upload-failed');
          }
        });
        
      } catch (batchError) {
        console.error(`Failed to batch update failed status for group ${groupFilename}:`, batchError);
        // Remove from uploadingFiles even on error - useAppDataStore will handle data
        convertedFiles.forEach(({ filename }) => {
          console.log(`🗑️ Removing ${filename} from uploadingFiles set after batch error`);
          setUploadingFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(filename);
            return newSet;
          });
        });
      }
      
      // Update counters (only once per group, not per file)
      setFailedPdfFiles(prev => {
        const newCount = prev + convertedFiles.length;
        console.log(`📊 Counter update for group ${groupFilename}: ${prev} + ${convertedFiles.length} = ${newCount} failed files`);
        return newCount;
      });
      
      // Update job's original_files_failed_count in real-time
      if (jobData?.job_id && setJobData) {
        try {
          console.log(`🔄 Updating job original_files_failed_count by +${convertedFiles.length}`);
          
          // Update job object with incremented failed count
          const updateResponse = await fetch(`/api/content-pipeline-proxy?operation=update_job&id=${jobData.job_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              increment_failed_count: convertedFiles.length
            })
          });
          
          if (updateResponse.ok) {
            const result = await updateResponse.json();
            console.log(`✅ Job failed count updated: +${convertedFiles.length} files`);
            
            // Use the complete job object returned from increment API
            if (result.job) {
              console.log(`📦 Updating local job data with complete object from increment API`);
              setJobData(prev => ({
                ...(prev || {}), // Handle null prev safely
                ...result.job, // Use entire job object from API response
                // Preserve UI-specific fields that might not be in API response
                api_files: result.job.files || prev?.api_files || [],
                content_pipeline_files: prev?.content_pipeline_files || [],
                Subset_name: result.job.source_folder || prev?.Subset_name
              }));
            } else {
              // Fallback to manual increment if no job object returned
              setJobData(prev => ({
                ...(prev || {}), // Handle null prev safely
                original_files_failed_count: ((prev?.original_files_failed_count || 0) + convertedFiles.length)
              }));
            }
          } else {
            console.warn(`⚠️ Failed to update job failed count: ${updateResponse.status}`);
          }
        } catch (error) {
          console.error(`❌ Error updating job failed count:`, error);
        }
      }
      
      throw error;
    } finally {
      // Always ensure files are removed from uploadingFiles set, regardless of success/failure
      console.log(`🧹 Cleanup: Ensuring all files from group ${groupFilename} are removed from uploadingFiles set`);
      filesToCleanup.forEach((filename) => {
        console.log(`🗑️ Final cleanup: Removing ${filename} from uploadingFiles set`);
        setUploadingFiles(prev => {
          const newSet = new Set(prev);
          const wasRemoved = newSet.delete(filename);
          if (wasRemoved) {
            console.log(`✅ Successfully removed ${filename} from uploadingFiles set in finally block`);
          } else {
            console.log(`ℹ️ ${filename} was already removed from uploadingFiles set`);
          }
          console.log(`📊 uploadingFiles count after cleanup: ${newSet.size}, remaining files:`, Array.from(newSet));
          return newSet;
        });
      });
    }
  }, [updateLocalFileStatus, setJobData, jobData, fileStatusMutation]);

  // Robust group upload - handles individual file failures gracefully
  // Helper function to add timeout to any promise
  const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]);
  };

  const uploadRobustFileGroup = useCallback(async (
    groupFilename: string,
    groupFiles: Array<{filename: string, file: File, fileInfo: any}>
  ): Promise<void> => {
    console.log(`🚀 Robust upload for group ${groupFilename} with ${groupFiles.length} files`);

    // Start with processing state for UI feedback (local UI only)
    const filesToCleanup = groupFiles.map(f => f.filename);
    groupFiles.forEach(({ filename }) => {
      console.log(`🔄 Setting ${filename} to processing status for UI`);
      if (onFileStatusChange) {
        onFileStatusChange(filename, 'processing');
      }
    });

    let successfulFiles: string[] = [];
    let failedFiles: string[] = [];
    
    try {
      // Transition to uploading state (local UI only)
      groupFiles.forEach(({ filename }) => {
        console.log(`📤 Adding ${filename} to uploadingFiles set and setting uploading status`);
        setUploadingFiles(prev => new Set(prev).add(filename));
        if (onFileStatusChange) {
          onFileStatusChange(filename, 'uploading');
        }
      });

      // Small delay to make uploading state visible before actual uploads
      await new Promise(resolve => setTimeout(resolve, 300));

      // Prepare files using backend-provided file_path to ensure the
      // presigned policy and S3 triggers match exactly (PDFs or images)
      const filesToUpload = groupFiles.map(({ file, fileInfo, filename }) => {
        const destinationKey = fileInfo.file_path;
        console.log(`📄 Preparing file for direct upload: ${filename} -> ${destinationKey}`);
        return { file, filePath: destinationKey };
      });

      console.log(`🗂️ Final S3 keys for direct upload:`, filesToUpload.map(f => f.filePath));

      // Upload each file directly
      console.log(`🚀 Starting individual file uploads for group ${groupFilename}...`);
      const uploadResults = await withTimeout(
        Promise.allSettled(
          filesToUpload.map(async ({ file, filePath }, index) => {
            const displayName = groupFiles[index]?.filename || file.name;
            try {
              console.log(`🔼 Starting direct upload for ${displayName} -> S3 path: ${filePath}... (${(file.size/1024/1024).toFixed(2)}MB)`);
              await uploadFilesToContentPipeline([{ file, filePath }]);
              successfulFiles.push(displayName);
              console.log(`✅ Successfully uploaded ${displayName}`);
              if (onFileStatusChange) {
                onFileStatusChange(displayName, 'uploaded');
              }
              return { success: true, filename: displayName };
            } catch (error) {
              console.error(`❌ File ${displayName} upload failed:`, error);
              failedFiles.push(displayName);
              if (onFileStatusChange) {
                onFileStatusChange(displayName, 'upload-failed');
              }
              return { success: false, filename: displayName, error };
            }
          })
        ),
        600000, // 10 minute timeout for all individual uploads in this group
        `Individual file uploads for group ${groupFilename}`
      );
      
      console.log(`📊 Group ${groupFilename} upload results: ${successfulFiles.length} PDF files successful, ${failedFiles.length} PDF files failed`);
      
      // Track successful uploads for local counters
      if (successfulFiles.length > 0) {
        const pdfFileCount = successfulFiles.length;
        setUploadedPdfFiles(prev => prev + pdfFileCount);
        console.log(`✅ Tracked ${pdfFileCount} successful uploads (status updates now handled by S3 triggers)`);
      }
      
      // Update status for failed files with timeout
      if (failedFiles.length > 0) {
        const failedPdfFileCount = failedFiles.length;
        console.log(`🔄 Updating status for ${failedPdfFileCount} failed PDF files...`);
        console.log(`📊 Failed PDF files:`, failedFiles);
        
        const failedUpdates = failedFiles.map(filename => ({
          pdf_filename: filename,
          status: 'upload-failed' as const
        }));
        
        await withTimeout(
          fileStatusMutation({
            type: 'batchUpdatePdfFileStatus',
            jobId: jobData.job_id,
            fileId: groupFilename,
            data: { pdfUpdates: failedUpdates }
          }),
          10000, // 10 second timeout for status mutation
          `Failed status mutation for group ${groupFilename}`
        );
        
        setFailedPdfFiles(prev => prev + failedPdfFileCount);
        console.log(`❌ Updated ${failedPdfFileCount} PDF files to failed status`);
      }
      
    } catch (error) {
      console.error(`❌ Group ${groupFilename} completely failed:`, error);
      failedFiles = filesToCleanup;
      const failedPdfFileCount = failedFiles.length;
      setFailedPdfFiles(prev => prev + failedPdfFileCount);
      console.log(`❌ Marked ${failedPdfFileCount} PDF files as failed due to group failure`);
      throw error;
    } finally {
      // Always clean up uploadingFiles set
      console.log(`🧹 Cleaning up uploadingFiles for group ${groupFilename}`);
      filesToCleanup.forEach(filename => {
        setUploadingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(filename);
          return newSet;
        });
      });
    }
  }, [fileToBase64, uploadLargeFileToS3, updateLocalFileStatus, fileStatusMutation, jobData, createdFiles, setUploadedPdfFiles, setFailedPdfFiles]);

  // Start the upload process with pipeline optimization
  const startUploadProcess = useCallback(async (files: File[]): Promise<void> => {
    // Use createdFiles if provided, otherwise fall back to jobData.content_pipeline_files
    const filesToCheck = createdFiles && createdFiles.length > 0 ? createdFiles : jobData?.content_pipeline_files;
    
    if (!filesToCheck) {
      console.log('startUploadProcess: No files found (neither createdFiles nor content_pipeline_files)');
      return;
    }
    
    console.log('📋 startUploadProcess using:', createdFiles && createdFiles.length > 0 ? 'createdFiles' : 'jobData.content_pipeline_files');
    console.log('📊 Files to check:', filesToCheck?.length || 0, 'file groups');
    
    console.log('🚀 Starting pipelined upload process for files:', files.map(f => f.name));
    
    // Create file mapping
    const fileMap = new Map<string, File>();
    console.log(`📁 Creating file mapping for ${files.length} File objects:`);
    files.forEach((file, index) => {
      console.log(`  📄 File ${index + 1}: "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      fileMap.set(file.name, file);
    });
    console.log(`📊 File map created with ${fileMap.size} entries`);
    
    // Group files by their logical file group
    const fileGroups = new Map<string, Array<{filename: string, file: File, fileInfo: any}>>();
    let totalPdfFiles = 0;
    
    filesToCheck.forEach((fileObj: any) => {
      if (fileObj.original_files) {
        const groupFiles: Array<{filename: string, file: File, fileInfo: any}> = [];
        
        console.log(`📁 Processing file group "${fileObj.filename}" with ${Object.keys(fileObj.original_files).length} original files:`);
        
        Object.entries(fileObj.original_files).forEach(([filename, fileInfo]: [string, any], index) => {
          // Resolve the File object by sanitized key OR original_filename (may contain diacritics)
          const file = fileMap.get(filename) || (fileInfo?.original_filename ? fileMap.get(fileInfo.original_filename) : undefined);
          console.log(`  📄 File ${index + 1}/${Object.keys(fileObj.original_files).length}: "${filename}" - File object ${file ? 'found' : 'NOT FOUND'}`);
          
          if (file) {
            groupFiles.push({ filename, file, fileInfo });
            totalPdfFiles++;
            console.log(`    ✅ Added to group (fileInfo.file_path: ${fileInfo.file_path})`);
          } else {
            console.log(`    ❌ Skipped - no File object available`);
          }
        });
        
        console.log(`📊 Group "${fileObj.filename}" final count: ${groupFiles.length} files ready for upload`);
        
        if (groupFiles.length > 0) {
          fileGroups.set(fileObj.filename, groupFiles);
        }
      }
    });
    
    // Update totals only if different, preserve existing uploaded/failed counts
    console.log(`📊 Total: ${fileGroups.size} file groups, ${totalPdfFiles} PDF files`);
    setTotalPdfFiles(prev => {
      if (prev !== totalPdfFiles) {
        console.log(`📊 Updating total PDF files from ${prev} to ${totalPdfFiles}`);
        return totalPdfFiles;
      }
      return prev;
    });
    // Don't reset uploaded/failed counters - preserve existing state from job data
    console.log('📊 Preserving existing uploaded/failed counts (not resetting to 0)');
    
    // Robust group processing: Keep groups but make them independent
    console.log(`🔄 ROBUST GROUP PROCESSING:`);
    console.log(`📊 Total file groups: ${fileGroups.size}`);
    
    const groupEntries = Array.from(fileGroups.entries());
    const batchSize = 2; // Process 2 groups at a time
    console.log(`📊 Batch size: ${batchSize} groups`);
    console.log(`📊 Expected batches: ${Math.ceil(groupEntries.length / batchSize)}`);
    console.log(`📁 All file groups:`, groupEntries.map(([name, files]) => `${name} (${files.length} files)`));
    
    // Process groups in simple batches
    for (let i = 0; i < groupEntries.length; i += batchSize) {
      const currentGroupBatch = groupEntries.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(groupEntries.length / batchSize);
      
      console.log(`📦 STARTING BATCH ${batchNumber}/${totalBatches}:`);
      console.log(`  📁 Groups in this batch:`, currentGroupBatch.map(([name]) => name));
      
      // Process each group independently with Promise.allSettled
      const groupResults = await Promise.allSettled(
        currentGroupBatch.map(async ([groupFilename, groupFiles]) => {
          try {
            await uploadRobustFileGroup(groupFilename, groupFiles);
            return { success: true, groupFilename };
          } catch (error) {
            console.error(`❌ Group ${groupFilename} failed:`, error);
            return { success: false, groupFilename, error: error.message };
          }
        })
      );
      
      // Log batch results
      const successCount = groupResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failedCount = groupResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
      
      console.log(`✅ BATCH ${batchNumber} COMPLETED:`);
      console.log(`  📊 Results: ${successCount} successful, ${failedCount} failed`);
      
      // Small delay between batches
      if (i + batchSize < groupEntries.length) {
        console.log(`⏳ Waiting 500ms before next batch...`);
        await wait(500);
      }
    }
    
    console.log(`🏁 BATCH PROCESSING COMPLETE:`);
    console.log(`📊 Processed ${groupEntries.length} file groups across ${Math.ceil(groupEntries.length / batchSize)} batches`);
    console.log(`📊 Expected ${totalPdfFiles} total files`);
    
    console.log('🎉 Pipelined upload process completed!');
    
    // Final summary
    console.log('📊 Upload Process Summary:');
    console.log(`  📁 Total file groups processed: ${fileGroups.size}`);
    console.log(`  📄 Total PDF files expected: ${totalPdfFiles}`);
    console.log(`  🗂️ File groups breakdown:`);
    fileGroups.forEach((groupFiles, groupName) => {
      console.log(`    📁 Group "${groupName}": ${groupFiles.length} files`);
      groupFiles.forEach((file, index) => {
        console.log(`      📄 ${index + 1}. ${file.filename}`);
      });
    });
    
  }, [jobData, preConvertBatch, uploadPreConvertedFileGroup]);

  // Check for files that need uploading and start process
  const checkAndStartUpload = useCallback(async (filesLoaded: boolean): Promise<void> => {
    console.log('🚀 checkAndStartUpload called with filesLoaded:', filesLoaded);
    
    // Use createdFiles if provided, otherwise fall back to jobData.content_pipeline_files
    const filesToCheck = createdFiles && createdFiles.length > 0 ? createdFiles : jobData?.content_pipeline_files;
    
    console.log('🔍 Upload preconditions check:', {
      filesLoaded,
      hasFilesToCheck: !!filesToCheck,
      filesCount: filesToCheck?.length || 0,
      uploadStarted,
      usingCreatedFiles: !!(createdFiles && createdFiles.length > 0),
      hasJobData: !!jobData,
      jobId: jobData?.job_id
    });
    
    // Check basic preconditions
    if (!filesLoaded || !filesToCheck) {
      console.log('⚠️ Skipping upload check - preconditions not met:', {
        filesLoaded,
        hasFilesToCheck: !!filesToCheck,
        filesCount: filesToCheck?.length || 0,
        usingCreatedFiles: !!(createdFiles && createdFiles.length > 0)
      });
      return;
    }
    
    // Don't check uploadStarted here - let it be idempotent
    // If upload is already running, the file status checks below will handle it

    console.log('✅ Files loaded, checking for uploads...');
    console.log('📊 Files to check:', filesToCheck?.length || 0, 'file groups');
    console.log('🔍 Using created files:', !!(createdFiles && createdFiles.length > 0));
    
    // Collect files that need uploading (consider available File objects during rerun)
    // Support both sanitized keys and original filenames with diacritics
    const filesToUpload: Array<{ filename: string; original_filename?: string; filePath: string }> = [];
    
    // Debug: log all file statuses
    const allFileStatuses: Record<string, string> = {};
    filesToCheck.forEach((fileGroup: any) => {
      if (fileGroup.original_files) {
        Object.entries(fileGroup.original_files).forEach(([filename, fileInfo]: [string, any]) => {
          allFileStatuses[filename] = fileInfo.status || 'unknown';
        });
      }
    });
    console.log('📋 All file statuses:', allFileStatuses);
    
    // Detect available File objects for this job (set by new-job/rerun flow)
    let availableFileNames = new Set<string>();
    try {
      const pending = (window as any).pendingUploadFiles;
      if (pending && pending.jobId === jobData.job_id && Array.isArray(pending.files)) {
        availableFileNames = new Set<string>(pending.files.map((f: File) => f.name));
      }
    } catch {}

    filesToCheck.forEach((fileGroup: any) => {
      if (fileGroup.original_files) {
        Object.entries(fileGroup.original_files).forEach(([filename, fileInfo]: [string, any]) => {
          // Only process files that are truly ready to upload
          // Skip files that are already being processed or completed
          const isInUploadingSet = uploadingFiles.has(filename);
          
          // Treat undefined/missing status as pending to support rerun-created files
          const statusValue = fileInfo.status || 'pending';
          // Consider either sanitized key (filename) or backend's original_filename (may include diacritics)
          const haveFileObject = availableFileNames.has(filename) ||
                                 (fileInfo.original_filename && availableFileNames.has(fileInfo.original_filename));
          // If we have the File object, upload unless already marked uploaded
          const shouldUploadBecauseWeHaveFile = haveFileObject && statusValue !== 'uploaded';
          const shouldUploadByStatusOnly = (statusValue === 'pending' || statusValue === 'uploading') && !haveFileObject;

          if ((shouldUploadBecauseWeHaveFile || shouldUploadByStatusOnly) && !isInUploadingSet) {
            console.log(`📤 Adding file to upload queue: ${filename} (status: ${fileInfo.status})`);
            filesToUpload.push({
              filename: filename,
              original_filename: fileInfo.original_filename,
              filePath: fileInfo.file_path
            });
          } else if (isInUploadingSet) {
            console.log(`⏭️ Skipping ${filename} - already being processed`);
          } else {
            console.log(`✅ Skipping ${filename} - status: ${fileInfo.status}`);
          }
        });
      }
    });

    if (filesToUpload.length === 0) {
      console.log('ℹ️ No files need uploading');
      console.log('🔍 Debug why no files need uploading:', {
        filesToCheckLength: filesToCheck?.length || 0,
        allFileStatuses: filesToCheck?.map(fg => ({
          filename: fg.filename,
          originalFiles: Object.fromEntries(
            Object.entries(fg.original_files || {}).map(([name, info]: [string, any]) => [name, info.status])
          )
        })) || []
      });
      return;
    }

    console.log(`📁 Found ${filesToUpload.length} files that need uploading:`, filesToUpload.map(f => f.filename));

    // Get File objects from sessionStorage (where new-job page stored them)
    // NOTE: This approach relies on File objects being stored in browser memory,
    // which is fragile and doesn't work if the page is refreshed. A more robust
    // approach would be to upload files immediately and store S3 paths.
    const uploadSession = sessionStorage.getItem(`upload_${jobData.job_id}`);
    let actualFiles: File[] = [];
    
    if (uploadSession) {
      try {
        const session = JSON.parse(uploadSession);
        // Get File objects from global state (they can't be stored in sessionStorage)
        const pendingFiles = (window as any).pendingUploadFiles;
        if (pendingFiles && pendingFiles.jobId === jobData.job_id && pendingFiles.files) {
          actualFiles = pendingFiles.files.filter((file: File) =>
            filesToUpload.some(needed => needed.filename === file.name || needed.original_filename === file.name)
          );
          console.log(`🚀 Found ${actualFiles.length} File objects for upload:`, actualFiles.map(f => f.name));
        }
      } catch (error) {
        console.error('Failed to get upload session or File objects:', error);
      }
    }
    
    if (actualFiles.length > 0) {
      console.log('🚀 Starting upload with File objects from new job creation...');
      console.log('📁 About to set uploadStarted to true and call startUploadProcess');
      console.log('📋 Files to upload:', actualFiles.map(f => f.name));
      
      setUploadStarted(true);
      
      try {
        console.log('🎯 Calling startUploadProcess with', actualFiles.length, 'files');
        await startUploadProcess(actualFiles);
        console.log('✅ startUploadProcess completed successfully');
      } catch (error) {
        console.error('❌ startUploadProcess failed:', error);
        // Reset upload started on failure
        setUploadStarted(false);
        throw error;
      }
    } else {
      console.error('❌ Files need uploading but no File objects available:', {
        filesNeeded: filesToUpload.length,
        hasUploadSession: !!uploadSession,
        hasPendingFiles: !!(window as any).pendingUploadFiles,
        pendingFilesJobId: (window as any).pendingUploadFiles?.jobId,
        currentJobId: jobData.job_id,
        availableFileNames: (window as any).pendingUploadFiles?.files?.map((f: File) => f.name) || [],
        neededFileNames: filesToUpload.map(f => f.filename),
        neededOriginalNames: filesToUpload.map(f => f.original_filename).filter(Boolean)
      });
      
      // Throw error to notify the calling component
      throw new Error(`Upload cannot start: ${filesToUpload.length} files need uploading but File objects are not available. This usually happens when the page is refreshed or the files are no longer in memory.`);
    }
  }, [jobData, createdFiles, startUploadProcess]);

  // Add debugging for the dependency changes
  useEffect(() => {
    const changeId = Date.now();
    console.log(`📋 checkAndStartUpload dependencies changed #${changeId}:`, {
      hasJobData: !!jobData,
      jobId: jobData?.job_id,
      createdFilesLength: createdFiles?.length || 0,
      hasStartUploadProcess: !!startUploadProcess
    });
    
    // Track frequency of recreations
    console.log('⚠️ If you see this message repeatedly, there is a dependency loop');
  }, [jobData, createdFiles, startUploadProcess]);

  // Track when upload monitoring started for timeout detection
  const uploadMonitoringStartTime = useRef<number | null>(null);

  // Monitor upload completion
  useEffect(() => {
    // Use createdFiles if provided, otherwise fall back to jobData.content_pipeline_files
    const filesToCheck = createdFiles && createdFiles.length > 0 ? createdFiles : jobData?.content_pipeline_files;
    
    if (!filesToCheck || allFilesUploaded || !uploadStarted) {
      return;
    }

    // Initialize monitoring start time
    if (!uploadMonitoringStartTime.current) {
      uploadMonitoringStartTime.current = Date.now();
      console.log('🕐 Starting upload completion monitoring');
    }

    // Track last logged state to avoid repetitive logs
    let lastLoggedState = '';
    let logCount = 0;
    const maxLogs = 10; // Stop excessive logging after 10 iterations
    
    const checkUploadStatus = () => {
      const allFilesProcessed = totalPdfFiles > 0 && (uploadedPdfFiles + failedPdfFiles) === totalPdfFiles;
      const noActiveUploads = uploadingFiles.size === 0;
      const hasUploads = uploadedPdfFiles > 0;
      const isComplete = allFilesProcessed && noActiveUploads && hasUploads;
      
      // Create state signature to avoid repetitive logging
      const currentState = `${uploadedPdfFiles}/${totalPdfFiles}-${failedPdfFiles}-${uploadingFiles.size}`;
      const shouldLog = currentState !== lastLoggedState || logCount < 3;
      
      if (shouldLog && logCount < maxLogs) {
        console.log(`📊 Upload status: ${currentState} (uploaded/total-failed-uploading)`, isComplete ? '✅ Complete' : '⏳ In progress');
        
        if (!isComplete) {
          const processedCount = uploadedPdfFiles + failedPdfFiles;
          const missingCount = totalPdfFiles - processedCount;
          
          if (missingCount > 0 && uploadingFiles.size === 0) {
            console.warn(`⚠️ ${missingCount} files missing from tracking (uploaded=${uploadedPdfFiles}, failed=${failedPdfFiles}, uploading=${uploadingFiles.size})`);
          } else if (uploadingFiles.size > 0) {
            console.log(`⏳ ${uploadingFiles.size} files still uploading`);
          }
        }
        
        lastLoggedState = currentState;
        logCount++;
      } else if (logCount >= maxLogs && shouldLog) {
        console.log(`🔇 Upload monitoring continuing silently... (${currentState})`);
        logCount++; // Only log this once
      }
      
      // Timeout safety mechanism: force completion if stuck for too long
      const now = Date.now();
      const timeElapsed = uploadMonitoringStartTime.current ? now - uploadMonitoringStartTime.current : 0;
      const timeoutThreshold = 2 * 60 * 1000; // Reduced to 2 minutes for faster recovery
      
      if (timeElapsed > timeoutThreshold && !isComplete && hasUploads && uploadingFiles.size > 0) {
        console.warn(`⚠️ Upload timeout detected! ${timeElapsed}ms elapsed, forcing completion despite ${uploadingFiles.size} files in uploadingFiles set:`, Array.from(uploadingFiles));
        console.warn('🧹 Clearing stuck files from uploadingFiles set to allow completion');
        
        // Force clear uploadingFiles set
        setUploadingFiles(new Set());
        
        // This will trigger completion on the next check
        return;
      }
      
      if (isComplete && !allFilesUploaded) {
        console.log('✅ Upload completed! Calling completion handler...');
        setAllFilesUploaded(true);
        
        // Call completion callback or navigate
        if (onUploadComplete) {
          console.log('🔄 Calling onUploadComplete callback...');
          onUploadComplete();
        } else {
          console.log('📍 No onUploadComplete callback, using default navigation...');
          // Default navigation after delay
          setTimeout(() => {
            router.push('/jobs');
          }, 1500);
        }
      }
    };

    checkUploadStatus();
    const interval = setInterval(checkUploadStatus, 2000); // Reduced frequency: every 2 seconds instead of 500ms
    return () => clearInterval(interval);
  }, [createdFiles, jobData, uploadingFiles, allFilesUploaded, totalPdfFiles, uploadedPdfFiles, failedPdfFiles, onUploadComplete, router]);

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