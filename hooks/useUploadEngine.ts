'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { JobData, FileData } from '../web/utils/contentPipelineApi';
import { useQueryClient } from '@tanstack/react-query';
import { useAppDataStore } from './useAppDataStore';

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

  // Upload files directly via our S3 proxy to avoid Vercel payload limits
  const uploadFilesToContentPipeline = useCallback(async (
    files: Array<{ file: File; filePath: string }>
  ): Promise<void> => {
    try {
      console.log('📤 Starting direct S3 proxy upload for', files.length, 'files');
      
      const uploadedFiles = [];
      
      for (const { file, filePath } of files) {
        console.log(`📤 Uploading file via S3 proxy: ${filePath} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        
        // Step 1: Get presigned PUT URL for our S3 bucket
        const s3Key = `asset_generator/dev/uploads/${filePath}`;
        const presignedResponse = await fetch('/api/s3-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_method: 'put',
            filename: s3Key,
            expires_in: 3600
          }),
        });

        if (!presignedResponse.ok) {
          throw new Error(`Failed to get presigned URL for ${filePath}: ${presignedResponse.status}`);
        }

        const { url: presignedUrl } = await presignedResponse.json();
        
        // Step 2: Upload file directly to S3 via our proxy (bypasses Vercel limits)
        const uploadResponse = await fetch('/api/s3-upload', {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/pdf',
            'x-presigned-url': presignedUrl,
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          throw new Error(`Failed to upload ${filePath}: ${uploadResponse.status} - ${errorText}`);
        }

        uploadedFiles.push({ filename: filePath, s3_key: s3Key });
        console.log(`✅ Successfully uploaded via proxy: ${filePath}`);
      }
      
      // Step 3: Notify Content Pipeline about the uploaded files
      console.log('📤 Notifying Content Pipeline about uploaded files...');
      const notifyResponse = await fetch('/api/content-pipeline-proxy?operation=register_uploaded_files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobData?.job_id,
          uploaded_files: uploadedFiles
        }),
      });

      if (!notifyResponse.ok) {
        console.warn('⚠️ Failed to notify Content Pipeline about uploads, but files are uploaded');
        // Don't throw here - files are uploaded successfully
      }
      
      console.log('✅ All files uploaded successfully via S3 proxy');
    } catch (error) {
      console.error('❌ S3 proxy upload failed:', error);
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
          // For now, let's create a simple presigned PUT URL instead of complex POST
          console.log('📤 Getting simple presigned PUT URL instead of POST');
          
          // Request a simple PUT URL that works with our existing proxy
          const putUrlResponse = await fetch('/api/s3-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_method: 'put',
              filename: uploadInstruction.s3_key,
              expires_in: 3600
            }),
          });

          if (!putUrlResponse.ok) {
            throw new Error('Failed to get PUT presigned URL');
          }

          const { url: putUrl } = await putUrlResponse.json();
          
          // Use our S3 proxy with the PUT URL
          uploadResponse = await fetch('/api/s3-upload', {
            method: 'PUT',
            headers: {
              'Content-Type': file.type || 'application/pdf',
              'x-presigned-url': putUrl,
            },
            body: file,
          });
          
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
        // Multipart upload for very large files
        console.log('📤 Using multipart upload');
        const partETags = [];
        
        for (const partInfo of uploadInstruction.upload_data.part_urls) {
          const start = partInfo.size_range.start;
          const end = Math.min(partInfo.size_range.end + 1, file.size);
          const chunk = file.slice(start, end);
          
          console.log(`📤 Uploading part ${partInfo.part_number} (${start}-${end})`);
          
          const partResponse = await fetch(partInfo.url, {
            method: 'PUT',
            body: chunk,
          });
          
          if (!partResponse.ok) {
            throw new Error(`Part ${partInfo.part_number} upload failed: ${partResponse.status}`);
          }
          
          const etag = partResponse.headers.get('ETag');
          partETags.push({
            PartNumber: partInfo.part_number,
            ETag: etag
          });
        }
        
        // Complete multipart upload
        console.log('📤 Completing multipart upload');
        const completeXML = `<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUpload>
${partETags.map(part => `  <Part><PartNumber>${part.PartNumber}</PartNumber><ETag>${part.ETag}</ETag></Part>`).join('\n')}
</CompleteMultipartUpload>`;
        
        uploadResponse = await fetch(uploadInstruction.upload_data.complete_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/xml' },
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
    status: 'uploading' | 'uploaded' | 'upload-failed'
  ): Promise<void> => {
    if (!jobData?.content_pipeline_files) return;

    console.log('🔄 Updating status for', pdfFilename, 'in group', groupFilename, 'to', status);

    try {
      // Update backend first - single source of truth via centralized data store
      const response = await fileStatusMutation({
        type: 'updatePdfFileStatus',
        fileId: groupFilename,
        data: {
          pdfFilename,
          status
        }
      });

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

      // useAppDataStore automatically handles all cache updates
      console.log('✅ useAppDataStore automatically updated caches for file status change');
      
      console.log('✅ Backend and local state synced for', groupFilename);
      
    } catch (error) {
      console.error(`❌ Failed to update ${pdfFilename} status in backend:`, error);
      throw error;
    }
  }, [jobData, setJobData, queryClient]);

  // Local file status update (optimistic UI) - no counter updates since group-level handles this
  const updateLocalFileStatus = useCallback((
    groupFilename: string,
    pdfFilename: string,
    status: 'uploading' | 'uploaded' | 'upload-failed'
  ): void => {
    console.log('📱 Updating local file status:', pdfFilename, 'to', status);
    
    if (setJobData && jobData?.job_id) {
      const updater = (prev: any) => {
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
      };
      
      // Update local state
      setJobData(updater);
      
      // Also sync React Query cache to ensure UI updates
      if (queryClient) {
        console.log('✅ useAppDataStore automatically handles cache synchronization for job:', jobData.job_id);
        // Cache synchronization is now handled automatically by useAppDataStore
      }
    }
  }, [setJobData, jobData?.job_id, queryClient]);





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
    
    // Set optimistic uploading status for all files in group
    convertedFiles.forEach(({ filename }) => {
      updateLocalFileStatus(groupFilename, filename, 'uploading');
    });
    
    try {
      // Get upload instructions for all files (streaming approach for all)
      const fileInstructions = convertedFiles.map(({ file, fileInfo }) => ({
        filename: fileInfo.file_path,
        size: file.size,
        content_type: file.type || 'application/pdf'
      }));
      
      const instructionsResponse = await fetch('/api/content-pipeline-proxy?operation=s3_upload_files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({

          folder: 'asset_generator/dev/uploads',
          files: fileInstructions
        }),
      });

      if (!instructionsResponse.ok) {
        const errorData = await instructionsResponse.json().catch(() => ({}));
        throw new Error(`Failed to get upload instructions for group ${groupFilename}: ${instructionsResponse.status} ${JSON.stringify(errorData)}`);
      }

      const instructionsResult = await instructionsResponse.json();
      
      // Upload each file using its specific streaming instructions
      for (let i = 0; i < convertedFiles.length; i++) {
        const { file, fileInfo } = convertedFiles[i];
        const uploadInstruction = instructionsResult.data.upload_instructions[i];
        await uploadLargeFileToS3(file, fileInfo.file_path, uploadInstruction);
      }

      console.log(`✅ File group ${groupFilename} streaming upload completed successfully`);
      
      // Update backend status for all files in the group with a single API call
      try {
        const pdfUpdates = convertedFiles.map(({ filename }) => ({
          pdf_filename: filename,
          status: 'uploaded' as const
        }));
        
        const statusResponse = await fileStatusMutation({
          type: 'batchUpdatePdfFileStatus',
          fileId: groupFilename,
          data: {
            pdfUpdates
          }
        });
        
        if (statusResponse?.file?.original_files) {
          // Update both local state and React Query cache with backend response
          if (setJobData && jobData?.job_id) {
            const updater = (prev: any) => {
              if (!prev?.content_pipeline_files) return prev;
              
              const updatedFiles = prev.content_pipeline_files.map((file: any) =>
                file.filename === groupFilename
                  ? {
                      ...file,
                      original_files: statusResponse.file.original_files,
                      last_updated: new Date().toISOString()
                    }
                  : file
              );
              
              return { ...prev, content_pipeline_files: updatedFiles };
            };
            
            // Update local state
            setJobData(updater);
            
            // Also sync React Query cache to ensure UI updates
            if (queryClient) {
              console.log('✅ useAppDataStore automatically handles cache synchronization for job:', jobData.job_id);
              // Cache synchronization is now handled automatically by useAppDataStore
            }
          }
        }
        
        console.log(`✅ Batch updated ${pdfUpdates.length} PDFs to 'uploaded' status`);
      } catch (error) {
        console.error(`Failed to batch update status for group ${groupFilename}:`, error);
        // Fallback to local status updates
        convertedFiles.forEach(({ filename }) => {
          updateLocalFileStatus(groupFilename, filename, 'uploaded');
        });
      }
      
      // Update counters (only once per group, not per file)
      setUploadedPdfFiles(prev => prev + convertedFiles.length);
      console.log(`📊 Updated counters: +${convertedFiles.length} uploaded files`);
      
      // Update job's original_files_completed_count in real-time
      if (jobData?.job_id && setJobData) {
        try {
          console.log(`🔄 Updating job original_files_completed_count by +${convertedFiles.length}`);
          
          // Update job object with incremented completed count
          const updateResponse = await fetch(`/api/content-pipeline-proxy?operation=update_job&id=${jobData.job_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              increment_completed_count: convertedFiles.length
            })
          });
          
          if (updateResponse.ok) {
            const result = await updateResponse.json();
            console.log(`✅ Job completed count updated: +${convertedFiles.length} files`);
            
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
                original_files_completed_count: ((prev?.original_files_completed_count || 0) + convertedFiles.length)
              }));
            }
          } else {
            console.warn(`⚠️ Failed to update job completed count: ${updateResponse.status}`);
          }
        } catch (error) {
          console.error(`❌ Error updating job completed count:`, error);
        }
      }
      
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
          fileId: groupFilename,
          data: {
            pdfUpdates
          }
        });
        
        if (statusResponse?.file?.original_files) {
          // Update local state with backend response
          if (setJobData) {
            setJobData(prev => {
              if (!prev?.content_pipeline_files) return prev;
              
              const updatedFiles = prev.content_pipeline_files.map((file: any) =>
                file.filename === groupFilename
                  ? {
                      ...file,
                      original_files: statusResponse.file.original_files,
                      last_updated: new Date().toISOString()
                    }
                  : file
              );
              
              return { ...prev, content_pipeline_files: updatedFiles };
            });
          }
        }
        
        console.log(`✅ Batch updated ${pdfUpdates.length} PDFs to 'upload-failed' status`);
      } catch (batchError) {
        console.error(`Failed to batch update failed status for group ${groupFilename}:`, batchError);
        // Fallback to local status updates
        convertedFiles.forEach(({ filename }) => {
          updateLocalFileStatus(groupFilename, filename, 'upload-failed');
        });
      }
      
      // Update counters (only once per group, not per file)
      setFailedPdfFiles(prev => prev + convertedFiles.length);
      console.log(`📊 Updated counters: +${convertedFiles.length} failed files`);
      
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
    }
  }, [updateLocalFileStatus, setJobData, jobData]);

  // Start the upload process with pipeline optimization
  const startUploadProcess = useCallback(async (files: File[]): Promise<void> => {
    if (!jobData?.content_pipeline_files) {
      console.log('startUploadProcess: No content_pipeline_files found');
      return;
    }
    
    console.log('🚀 Starting pipelined upload process for files:', files.map(f => f.name));
    
    // Create file mapping
    const fileMap = new Map<string, File>();
    files.forEach(file => fileMap.set(file.name, file));
    
    // Group files by their logical file group
    const fileGroups = new Map<string, Array<{filename: string, file: File, fileInfo: any}>>();
    let totalPdfFiles = 0;
    
    jobData.content_pipeline_files.forEach((fileObj: any) => {
      if (fileObj.original_files) {
        const groupFiles: Array<{filename: string, file: File, fileInfo: any}> = [];
        
        Object.entries(fileObj.original_files).forEach(([filename, fileInfo]: [string, any]) => {
          const file = fileMap.get(filename);
          if (file) {
            groupFiles.push({ filename, file, fileInfo });
            totalPdfFiles++;
          }
        });
        
        if (groupFiles.length > 0) {
          fileGroups.set(fileObj.filename, groupFiles);
        }
      }
    });
    
    // Set totals and reset counters
    console.log(`📊 Total: ${fileGroups.size} file groups, ${totalPdfFiles} PDF files`);
    setTotalPdfFiles(totalPdfFiles);
    setUploadedPdfFiles(0);
    setFailedPdfFiles(0);
    
    // Pipelined upload: Convert next batch while uploading current batch
    const groupEntries = Array.from(fileGroups.entries());
    const batchSize = 6; // Increased to 6 for maximum throughput
    
    let nextBatchConverted: Array<[string, Array<{filename: string, file: File, fileInfo: any, base64Content: string}>]> = [];
    
    for (let i = 0; i < groupEntries.length; i += batchSize) {
      const currentBatch = groupEntries.slice(i, i + batchSize);
      const nextBatch = groupEntries.slice(i + batchSize, i + batchSize * 2);
      
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(groupEntries.length / batchSize)}:`, currentBatch.map(([groupName]) => groupName));
      
      // Get converted files for current batch (either pre-converted or convert now)
      const currentConverted = nextBatchConverted.length > 0 
        ? nextBatchConverted 
        : await preConvertBatch(currentBatch);
      
      // Start uploading current batch AND converting next batch in parallel
      const uploadPromise = Promise.all(currentConverted.map(async ([groupFilename, convertedFiles]) => {
        try {
          await uploadPreConvertedFileGroup(groupFilename, convertedFiles);
          return { success: true, groupFilename };
        } catch (error) {
          console.error(`Failed to upload file group ${groupFilename}:`, error);
          return { success: false, groupFilename };
        }
      }));
      
      // Convert next batch in parallel if it exists
      const convertPromise = nextBatch.length > 0 ? preConvertBatch(nextBatch) : Promise.resolve([]);
      
      const [uploadResults, nextConverted] = await Promise.all([uploadPromise, convertPromise]);
      
      // Store converted next batch for next iteration
      nextBatchConverted = nextConverted;
      
      // Log batch completion
      const successCount = uploadResults.filter(r => r.success).length;
      console.log(`✅ Batch completed: ${successCount}/${currentBatch.length} file groups uploaded successfully`);
      
      // Shorter delay between batches for better throughput
      if (i + batchSize < groupEntries.length) {
        await wait(200);
      }
    }
    
    console.log('🎉 Pipelined upload process completed!');
  }, [jobData, preConvertBatch, uploadPreConvertedFileGroup]);

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
    if (!jobData?.content_pipeline_files || allFilesUploaded || !uploadStarted) {
      return;
    }

    const checkUploadStatus = () => {
      const allFilesProcessed = totalPdfFiles > 0 && (uploadedPdfFiles + failedPdfFiles) === totalPdfFiles;
      const noActiveUploads = uploadingFiles.size === 0;
      const hasUploads = uploadedPdfFiles > 0;
      const isComplete = allFilesProcessed && noActiveUploads && hasUploads;
      
      console.log('📊 Upload status check:', {
        totalPdfFiles,
        uploadedPdfFiles,
        failedPdfFiles,
        uploadingFilesCount: uploadingFiles.size,
        allFilesProcessed,
        noActiveUploads,
        hasUploads,
        isComplete,
        allFilesUploaded,
        onUploadCompleteExists: !!onUploadComplete
      });
      
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