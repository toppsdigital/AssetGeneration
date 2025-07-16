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

  // Upload files using Content Pipeline API
  const uploadFilesToContentPipeline = useCallback(async (
    files: Array<{ file: File; filePath: string }>
  ): Promise<void> => {
    try {
      console.log('📤 Starting Content Pipeline upload for', files.length, 'files');
      
      // Convert files to base64 format required by API
      const uploadFiles = await Promise.all(
        files.map(async ({ file, filePath }) => ({
          filename: filePath,
          content: await fileToBase64(file),
          content_type: file.type || 'application/pdf'
        }))
      );
      
      // Upload to Content Pipeline
      const response = await fetch('/api/content-pipeline-proxy?operation=s3_upload_files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: uploadFiles,
          job_id: jobData?.job_id,
          folder: 'asset_generator/dev/uploads'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      console.log('✅ Content Pipeline upload successful:', result);
      
      return result;
    } catch (error) {
      console.error('❌ Content Pipeline upload failed:', error);
      throw error;
    }
  }, [fileToBase64, jobData]);

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

  // Local file status update (optimistic UI) - no counter updates since group-level handles this
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
  }, [setJobData]);





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

  // Upload pre-converted file group
  const uploadPreConvertedFileGroup = useCallback(async (
    groupFilename: string,
    convertedFiles: Array<{filename: string, file: File, fileInfo: any, base64Content: string}>
  ): Promise<void> => {
    console.log(`🚀 Uploading pre-converted file group ${groupFilename} with ${convertedFiles.length} PDFs`);
    
    // Set optimistic uploading status for all files in group
    convertedFiles.forEach(({ filename }) => {
      updateLocalFileStatus(groupFilename, filename, 'uploading');
    });
    
    try {
      // Upload files using pre-converted base64 content
      const uploadFiles = convertedFiles.map(({ fileInfo, base64Content }) => ({
        filename: fileInfo.file_path,
        content: base64Content,
        content_type: 'application/pdf'
      }));
      
      const response = await fetch('/api/content-pipeline-proxy?operation=s3_upload_files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: uploadFiles,
          job_id: jobData?.job_id,
          folder: 'asset_generator/dev/uploads'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
      }

      console.log(`✅ File group ${groupFilename} uploaded successfully`);
      
      // Update backend status for all files in the group with a single API call
      try {
        const pdfUpdates = convertedFiles.map(({ filename }) => ({
          pdf_filename: filename,
          status: 'uploaded' as const
        }));
        
        const statusResponse = await contentPipelineApi.batchUpdatePdfFileStatus(groupFilename, pdfUpdates);
        
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
      
    } catch (error) {
      console.error(`❌ Failed to upload file group ${groupFilename}:`, error);
      
      // Update backend status for all files in the group to failed with a single API call
      try {
        const pdfUpdates = convertedFiles.map(({ filename }) => ({
          pdf_filename: filename,
          status: 'upload-failed' as const
        }));
        
        const statusResponse = await contentPipelineApi.batchUpdatePdfFileStatus(groupFilename, pdfUpdates);
        
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