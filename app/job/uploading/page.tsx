'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { JobHeader, Spinner } from '../../../components';
import { useAppDataStore } from '../../../hooks/useAppDataStore';
import { useUploadEngine } from '../../../hooks/useUploadEngine';

interface UploadSession {
  jobId: string;
  appName: string;
  filenamePrefix: string;
  description: string;
  files: Array<{
    name: string;
    size: number;
    type: string;
  }>;
}

function JobUploadingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId');

  // State
  const [uploadSession, setUploadSession] = useState<UploadSession | null>(null);
  const [currentStep, setCurrentStep] = useState<'validating' | 'creating-files' | 'uploading' | 'completed' | 'error'>('validating');
  const [error, setError] = useState<string | null>(null);
  const [createdFiles, setCreatedFiles] = useState<any[]>([]);
  const [uploadAttempted, setUploadAttempted] = useState(false);
  
  // Local file status tracking for real-time UI feedback (UI-only states)
  // These states provide immediate visual feedback: pending -> processing -> uploading -> uploaded/failed
  // They are independent of backend states and focus on user experience
  const [localFileStatuses, setLocalFileStatuses] = useState<Record<string, string>>({});

  // Debug createdFiles state changes
  useEffect(() => {
    console.log('📋 createdFiles state updated:', {
      length: createdFiles.length,
      fileGroups: createdFiles.map(fg => fg.filename),
      totalPdfs: createdFiles.reduce((total, fg) => total + Object.keys(fg.original_files || {}).length, 0)
    });
  }, [createdFiles]);

  // Debug local file statuses changes
  useEffect(() => {
    if (Object.keys(localFileStatuses).length > 0) {
      console.log('📊 Local file statuses updated:', localFileStatuses);
      
      // Show status distribution
      const statusCounts = Object.values(localFileStatuses).reduce((acc, status) => {
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log('📈 Status distribution:', statusCounts);
    }
  }, [localFileStatuses]);

  // Fetch job data (likely cached from just created job) 
  const { 
    data: jobData, 
    isLoading: jobLoading, 
    error: jobError, 
    mutate: mutateJob,
    refresh: refreshJobData
  } = useAppDataStore('jobDetails', { 
    jobId: jobId || '', 
    includeFiles: false, // No need to fetch files - we'll use created files directly
    autoRefresh: false // Disabled to prevent unnecessary calls
  });

  // Upload engine for processing and uploading files  
  const uploadEngine = useUploadEngine({ 
    jobData, 
    createdFiles, // Pass created files to remove dependency on window.pendingUploadFiles
    setJobData: () => {
      // No job data updates needed - S3 triggers handle everything
    },
    onUploadComplete: () => {
      console.log('✅ All uploads completed, navigating to jobs list');
      setCurrentStep('completed');
      // Clean up session data
      if (jobId) {
        sessionStorage.removeItem(`upload_${jobId}`);
        delete (window as any).pendingUploadFiles;
      }
      // Navigate to jobs list
      setTimeout(() => router.push('/jobs'), 1000);
    },
    // Add callback for real-time status updates
    onFileStatusChange: (filename: string, status: string) => {
      console.log(`🔄 Upload engine reports: ${filename} -> ${status}`);
      updateLocalFileStatus(filename, status);
    }
  });

  // Function to update local file status for real-time UI feedback
  const updateLocalFileStatus = useCallback((filename: string, status: string) => {
    console.log(`🔄 Updating local status for ${filename}: ${status}`);
    setLocalFileStatuses(prev => ({
      ...prev,
      [filename]: status
    }));
  }, []);

  // Helper function to get backend file status
  const getBackendFileStatus = useCallback((filename: string): string | null => {
    for (const fileGroup of createdFiles) {
      if (fileGroup.original_files && fileGroup.original_files[filename]) {
        return fileGroup.original_files[filename].status;
      }
    }
    return null;
  }, [createdFiles]);

  // Monitor upload engine state for final sync only (let onFileStatusChange handle real-time updates)
  useEffect(() => {
    console.log('🔧 Upload engine state:', {
      uploadStarted: uploadEngine.uploadStarted,
      totalPdfFiles: uploadEngine.totalPdfFiles,
      uploadedPdfFiles: uploadEngine.uploadedPdfFiles,
      failedPdfFiles: uploadEngine.failedPdfFiles,
      uploadingFilesCount: uploadEngine.uploadingFiles.size,
      uploadingFilesList: Array.from(uploadEngine.uploadingFiles)
    });

    // Minimal interference - only sync final states when upload engine counters change significantly
    if (uploadEngine.uploadStarted && createdFiles.length > 0) {
      // Only sync if there's a significant discrepancy in completed files
      const localUploadedCount = Object.values(localFileStatuses).filter(status => status === 'uploaded').length;
      const engineUploadedCount = uploadEngine.uploadedPdfFiles || 0;
      
      // More conservative sync - only when engine count is significantly higher
      if (engineUploadedCount > localUploadedCount + 2) {
        console.log(`📊 Major sync needed: Upload engine reports ${engineUploadedCount} uploaded, local has ${localUploadedCount}. Syncing...`);
        
        // Find files that should be completed but aren't marked as such locally
        Object.keys(localFileStatuses).forEach(filename => {
          const isStillUploading = uploadEngine.uploadingFiles.has(filename);
          const localStatus = localFileStatuses[filename];
          
          // Only update if file is no longer actively uploading and has a clear final backend status
          if (!isStillUploading && (localStatus === 'uploading' || localStatus === 'processing')) {
            const backendStatus = getBackendFileStatus(filename);
            if (backendStatus === 'uploaded' || backendStatus === 'upload-failed') {
              console.log(`🔄 Final sync: ${filename} ${localStatus} -> ${backendStatus}`);
              updateLocalFileStatus(filename, backendStatus);
            }
          }
        });
      }
    }
  }, [uploadEngine.uploadStarted, uploadEngine.uploadedPdfFiles, uploadEngine.failedPdfFiles, createdFiles, localFileStatuses, updateLocalFileStatus, getBackendFileStatus]);

  // Validate session and redirect if invalid
  useEffect(() => {
    if (!jobId) {
      console.error('❌ No jobId provided, redirecting to jobs page');
      router.push('/jobs');
      return;
    }

    // Check for upload session in sessionStorage
    const uploadSessionData = sessionStorage.getItem(`upload_${jobId}`);
    if (!uploadSessionData) {
      console.error('❌ No upload session found, redirecting to jobs page');
      router.push('/jobs');
      return;
    }

    // Check for actual files
    const pendingFiles = (window as any).pendingUploadFiles;
    if (!pendingFiles || pendingFiles.jobId !== jobId) {
      console.error('❌ No pending files found, redirecting to jobs page');
      router.push('/jobs');
      return;
    }

    try {
      const session: UploadSession = JSON.parse(uploadSessionData);
      console.log('✅ Upload session validated:', session);
      setUploadSession(session);
      setCurrentStep('creating-files');
    } catch (error) {
      console.error('❌ Failed to parse upload session:', error);
      router.push('/jobs');
    }
  }, [jobId, router]);

  // Create files when ready
  useEffect(() => {
    console.log('🔄 Create files effect triggered:', {
      currentStep,
      hasJobData: !!jobData,
      hasUploadSession: !!uploadSession,
      jobId: jobData?.job_id,
      sessionFiles: uploadSession?.files?.length || 0
    });
    
    if (currentStep === 'creating-files' && jobData && uploadSession) {
      console.log('✅ Conditions met, calling createFiles()');
      createFiles();
    } else {
      console.log('⏸️ Create files not ready:', {
        currentStep,
        hasJobData: !!jobData,
        hasUploadSession: !!uploadSession
      });
    }
  }, [currentStep, jobData, uploadSession]);

  // Periodic sync with backend data to catch S3 trigger updates
  useEffect(() => {
    if (currentStep !== 'uploading' || !uploadEngine.uploadStarted) {
      return;
    }

    const syncInterval = setInterval(() => {
      console.log('🔄 Syncing local file statuses with backend data...');
      
      // Update local statuses with any backend changes (like from S3 triggers)
      createdFiles.forEach((fileGroup: any) => {
        if (fileGroup.original_files) {
          Object.entries(fileGroup.original_files).forEach(([filename, fileInfo]: [string, any]) => {
            const backendStatus = fileInfo.status;
            const currentLocalStatus = localFileStatuses[filename];
            
            // Only update local status if backend has a "final" status (uploaded/failed)
            // and we don't already have that status locally
            if ((backendStatus === 'uploaded' || backendStatus === 'upload-failed') && 
                currentLocalStatus !== backendStatus) {
              console.log(`📡 Backend sync: ${filename} ${currentLocalStatus} -> ${backendStatus}`);
              updateLocalFileStatus(filename, backendStatus);
            }
          });
        }
      });
    }, 3000); // Sync every 3 seconds

    return () => clearInterval(syncInterval);
  }, [currentStep, uploadEngine.uploadStarted, createdFiles, localFileStatuses, updateLocalFileStatus]);

  // Browser-level warning for navigation during upload (browser close/refresh)
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Only show warning if actively uploading
      if (currentStep === 'uploading' && uploadEngine.uploadStarted) {
        const message = 'Files are still uploading. Are you sure you want to leave? This may interrupt the upload process.';
        event.preventDefault();
        event.returnValue = message; // For older browsers
        return message;
      }
    };

    // Add browser warning during upload
    if (currentStep === 'uploading' && uploadEngine.uploadStarted) {
      console.log('🚨 Adding browser navigation warning during upload');
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      console.log('🔄 Removing browser navigation warning');
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentStep, uploadEngine.uploadStarted]);

  // Browser back button warning (only when upload is actually running)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // Only show warning if actively uploading and files are still being processed
      if (currentStep === 'uploading' && uploadEngine.uploadStarted && uploadEngine.uploadingFiles.size > 0) {
        event.preventDefault();
        const confirmed = window.confirm(
          'Files are still uploading. Are you sure you want to leave? This may interrupt the upload process.'
        );
        
        if (!confirmed) {
          console.log('🚫 Back navigation cancelled by user during upload');
          // Push the current state back to prevent navigation
          window.history.pushState(null, '', window.location.href);
          return;
        }
        
        console.log('✅ User confirmed navigation during upload');
      }
    };

    // Only add listener when upload is actively running (not just started)
    if (currentStep === 'uploading' && uploadEngine.uploadStarted && uploadEngine.uploadingFiles.size > 0) {
      console.log('🚨 Adding back button navigation warning during active upload');
      window.addEventListener('popstate', handlePopState);
      
      // Add a history state only when uploads are actively running
      window.history.pushState({ uploadProtection: true }, '', window.location.href);
    }

    return () => {
      console.log('🔄 Removing back button navigation warning');
      window.removeEventListener('popstate', handlePopState);
    };
  }, [currentStep, uploadEngine.uploadStarted, uploadEngine.uploadingFiles.size]);

  // Start upload when we transition to uploading step and have created files
  useEffect(() => {
    const effectId = Date.now();
    console.log(`🔍 Upload effect triggered #${effectId}:`, {
      currentStep,
      createdFilesCount: createdFiles.length,
      uploadAttempted,
      jobId,
      dependencies: {
        currentStep_changed: (window as any).lastCurrentStep !== currentStep,
        createdFilesLength_changed: (window as any).lastCreatedFilesLength !== createdFiles.length,
        jobId_changed: (window as any).lastJobId !== jobId
      }
    });

    // Track previous values to identify what's changing
    (window as any).lastCurrentStep = currentStep;
    (window as any).lastCreatedFilesLength = createdFiles.length;
    (window as any).lastJobId = jobId;

    // Add a timeout to prevent immediate re-triggering
    const timeoutId = setTimeout(() => {
      console.log(`⏰ Effect #${effectId} timeout reached, proceeding...`);
    }, 100);

    // Check if we have the File objects needed for upload
    const pendingFiles = (window as any).pendingUploadFiles;
    if (!pendingFiles || pendingFiles.jobId !== jobId) {
      console.error('❌ Missing File objects for upload:', {
        hasPendingFiles: !!pendingFiles,
        pendingJobId: pendingFiles?.jobId,
        currentJobId: jobId,
        filesCount: pendingFiles?.files?.length || 0
      });
      
      if (currentStep === 'uploading') {
        setError('Upload files are no longer available. Please go back and select files again.');
        setCurrentStep('error');
        return;
      }
    }

    if (currentStep === 'uploading' && createdFiles.length > 0 && !uploadAttempted) {
      console.log('🚀 Attempting to start upload with created files:', createdFiles.length);
      console.log('📂 Created file groups:', createdFiles.map(fg => ({
        filename: fg.filename,
        originalFilesCount: Object.keys(fg.original_files || {}).length,
        originalFiles: Object.keys(fg.original_files || {}),
        statuses: Object.fromEntries(Object.entries(fg.original_files || {}).map(([name, info]: [string, any]) => [name, info.status]))
      })));
      
      // Count total PDFs for verification
      const totalPdfs = createdFiles.reduce((total, fg) => total + Object.keys(fg.original_files || {}).length, 0);
      console.log(`📊 Total PDFs to upload: ${totalPdfs}`);
      
      // Mark upload as attempted to prevent loops
      setUploadAttempted(true);
      
      // Start upload process - now idempotent, can be called multiple times safely
      console.log('🎯 Calling uploadEngine.checkAndStartUpload(true)');
      console.log('🔍 Pre-upload state check:', {
        createdFiles: createdFiles.length,
        filesWithUploadingStatus: createdFiles.reduce((count, fg) => {
          return count + Object.values(fg.original_files || {}).filter((file: any) => file.status === 'uploading').length;
        }, 0),
        pendingFiles: (window as any).pendingUploadFiles ? Object.keys((window as any).pendingUploadFiles).length : 0,
        pendingFilesJobId: (window as any).pendingUploadFiles?.jobId,
        currentJobId: jobId,
        uploadEngineStarted: uploadEngine.uploadStarted
      });
      
      // Call checkAndStartUpload - it's now safe to call multiple times
      try {
        console.log('📋 Calling checkAndStartUpload with true...');
        const result = uploadEngine.checkAndStartUpload(true);
        console.log('📋 checkAndStartUpload returned:', result);
        
        if (result && typeof result.catch === 'function') {
          result.catch(uploadError => {
            console.error('❌ Upload failed to start:', uploadError);
            setError(uploadError instanceof Error ? uploadError.message : 'Failed to start upload');
            setCurrentStep('error');
            setUploadAttempted(false); // Reset on error so user can retry
          });
        }
      } catch (syncError) {
        console.error('❌ Synchronous error calling checkAndStartUpload:', syncError);
        setError('Failed to start upload process');
        setCurrentStep('error');
        setUploadAttempted(false); // Reset on error so user can retry
      }
    } else if (currentStep === 'uploading' && uploadAttempted) {
      console.log('⏭️ Upload already attempted, skipping to prevent loop');
    } else if (currentStep === 'uploading' && createdFiles.length === 0) {
      console.log('⏳ Waiting for created files...');
    } else {
      console.log('⏸️ Upload not ready:', {
        currentStep,
        wrongStep: currentStep !== 'uploading',
        createdFilesLength: createdFiles.length,
        uploadAttempted,
        hasJobData: !!jobData,
        hasPendingFiles: !!(window as any).pendingUploadFiles,
        pendingFilesJobId: (window as any).pendingUploadFiles?.jobId,
        currentJobId: jobId
      });
    }

    // Cleanup timeout
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [currentStep, createdFiles.length, jobId]); // Simplified dependencies to prevent loop

  const createFiles = useCallback(async () => {
    if (!jobData || !uploadSession) return;

    try {
      console.log('🔄 Creating files for job:', jobData.job_id);

      // Get actual files
      const pendingFiles = (window as any).pendingUploadFiles;
      if (!pendingFiles || !pendingFiles.files) {
        throw new Error('No files found');
      }

      // Group files by base name for card processing
      const fileGroups = new Map<string, {name: string, type: 'front' | 'back'}[]>();
      uploadSession.files.forEach(fileInfo => {
        const fileName = fileInfo.name;
        const match = fileName.match(/^(.+)_(FR|BK)\.pdf$/i);
        if (match) {
          const baseName = match[1];
          const suffix = match[2].toUpperCase();
          const cardType = suffix === 'FR' ? 'front' : 'back';
          
          if (!fileGroups.has(baseName)) {
            fileGroups.set(baseName, []);
          }
          fileGroups.get(baseName)!.push({name: fileName, type: cardType});
        }
      });

      // Create files using useAppDataStore mutation and store response
      const createFilesResponse = await mutateJob({
        type: 'createFiles',
        jobId: jobData.job_id,
        data: Array.from(fileGroups.entries()).map(([baseName, pdfs]) => {
          const originalFiles: Record<string, any> = {};
          
          pdfs.forEach(pdf => {
            // Construct proper file_path: {app_name}/PDFs/{filename}
            const appName = jobData.app_name || 'unknown_app';
            const filePath = `${appName}/PDFs/${pdf.name}`;
            
            originalFiles[pdf.name] = {
              status: 'pending', // Start with pending status - upload will begin later
              card_type: pdf.type,
              file_path: filePath, // Proper S3 path format
              last_updated: new Date().toISOString()
            };
            
            console.log(`📄 Created file with path: ${filePath} (status: pending)`);
          });

          const fileGroup = {
            filename: baseName,
            job_id: jobData.job_id, // Include job_id at file group level only
            original_files: originalFiles,
            extracted_files: {},
            firefly_assets: {}
          };
          
          console.log(`📁 Created file group "${baseName}" for job: ${jobData.job_id} with ${pdfs.length} PDFs`);
          return fileGroup;
        })
      });

      console.log('✅ Files created successfully');
      console.log('🔍 Full createFilesResponse:', JSON.stringify(createFilesResponse, null, 2));
      
      // Store created files from response - no need for extra refreshJobData() call
      let filesToStore: any[] = [];
      if (createFilesResponse && createFilesResponse.created_files) {
        console.log('📦 Storing created files from batch_create_files response:', createFilesResponse.created_files);
        filesToStore = createFilesResponse.created_files;
      } else if (createFilesResponse && createFilesResponse.files) {
        console.log('📦 Storing created files from response.files:', createFilesResponse.files);
        filesToStore = createFilesResponse.files;
      } else if (createFilesResponse && createFilesResponse.data && createFilesResponse.data.created_files) {
        console.log('📦 Storing created files from response.data.created_files:', createFilesResponse.data.created_files);
        filesToStore = createFilesResponse.data.created_files;
      } else if (createFilesResponse && Array.isArray(createFilesResponse)) {
        console.log('📦 Response is array, using directly:', createFilesResponse);
        filesToStore = createFilesResponse;
      } else {
        console.warn('⚠️ No files found in batch_create_files response. Response structure:', {
          hasCreatedFiles: !!createFilesResponse?.created_files,
          hasFiles: !!createFilesResponse?.files,
          hasDataCreatedFiles: !!createFilesResponse?.data?.created_files,
          isArray: Array.isArray(createFilesResponse),
          keys: createFilesResponse ? Object.keys(createFilesResponse) : 'no response'
        });
        console.warn('⚠️ Full response for debugging:', createFilesResponse);
      }

      if (filesToStore.length > 0) {
        setCreatedFiles(filesToStore);
        
        // Initialize local file statuses with 'pending' status for all new files
        const initialStatuses: Record<string, string> = {};
        filesToStore.forEach((fileGroup: any) => {
          if (fileGroup.original_files) {
            Object.entries(fileGroup.original_files).forEach(([filename, fileInfo]: [string, any]) => {
              // Always start with 'pending' for new files to ensure proper state transitions
              initialStatuses[filename] = 'pending';
              console.log(`📝 Initializing local status for ${filename}: pending`);
            });
          }
        });
        setLocalFileStatuses(initialStatuses);
        console.log('✅ Local file statuses initialized with pending state:', initialStatuses);
      }
      
      // Start uploading immediately - no delay or refresh needed
      console.log('📤 Transitioning to uploading step');
      // Reset upload attempted flag to ensure upload can start
      setUploadAttempted(false);
      setCurrentStep('uploading');
      
    } catch (error) {
      console.error('❌ Failed to create files:', error);
      setError(error instanceof Error ? error.message : 'Failed to create files');
      setCurrentStep('error');
    }
  }, [jobData, uploadSession, mutateJob]);

  // Handle errors
  if (jobError || error) {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 30%, #2d2d2d 70%, #000000 100%)',
        color: '#e2e8f0',
        padding: '2rem 1rem'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem',
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
          }}>
            <h2 style={{ color: '#ff6b6b', marginBottom: '1rem' }}>❌ Upload Error</h2>
            <p style={{ color: '#e2e8f0', marginBottom: '2rem' }}>
              {error || jobError?.message || 'Unknown error occurred'}
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button 
                onClick={() => router.push('/new-job')}
                style={{ 
                  padding: '0.75rem 1.5rem', 
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: '600'
                }}
              >
                Create New Job
              </button>
              <button 
                onClick={() => router.push('/jobs')}
                style={{ 
                  padding: '0.75rem 1.5rem', 
                  background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                  color: 'white',
                  border: '1px solid rgba(107, 114, 128, 0.3)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: '600'
                }}
              >
                Back to Jobs
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading states
  if (jobLoading || currentStep === 'validating') {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 30%, #2d2d2d 70%, #000000 100%)',
        color: '#e2e8f0',
        padding: '2rem 1rem'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem',
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
          }}>
            <Spinner />
            <p style={{ marginTop: '1rem', color: '#e2e8f0' }}>Loading job data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!jobData) {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 30%, #2d2d2d 70%, #000000 100%)',
        color: '#e2e8f0',
        padding: '2rem 1rem'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem',
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
          }}>
            <p style={{ color: '#e2e8f0', marginBottom: '2rem' }}>Job not found</p>
            <button 
              onClick={() => router.push('/jobs')}
              style={{ 
                padding: '0.75rem 1.5rem', 
                background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                color: 'white',
                border: '1px solid rgba(107, 114, 128, 0.3)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: '600'
              }}
            >
              Back to Jobs
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Calculate actual file counts using both upload engine and local file statuses
  const totalFiles = createdFiles.reduce((total: number, fileGroup: any) => 
    total + Object.keys(fileGroup.original_files || {}).length, 0
  );
  
  // Count files by status using local file statuses
  const fileStatusCounts = Object.values(localFileStatuses).reduce((counts, status) => {
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  
  // Use upload engine as source of truth for completed files, local statuses for real-time feedback
  const uploadedFiles = Math.max(uploadEngine.uploadedPdfFiles || 0, fileStatusCounts.uploaded || 0);
  const failedFiles = Math.max(uploadEngine.failedPdfFiles || 0, fileStatusCounts['upload-failed'] || 0);
  const processingFiles = (fileStatusCounts.processing || 0);
  const uploadingFiles = Math.max(uploadEngine.uploadingFiles.size, fileStatusCounts.uploading || 0);
  const pendingFiles = Math.max(0, totalFiles - uploadedFiles - failedFiles - processingFiles - uploadingFiles);
  
  // Use upload engine's uploaded count for progress (more reliable)
  const progressPercentage = totalFiles > 0 ? (uploadedFiles / totalFiles) * 100 : 0;
  
  console.log('📊 Progress calculation (using local file statuses):', {
    createdFilesLength: createdFiles.length,
    totalFiles,
    fileStatusCounts,
    uploadedFiles,
    processingFiles,
    uploadingFiles,
    failedFiles,
    pendingFiles,
    progressPercentage,
    // For comparison with upload engine
    uploadEngineTotal: uploadEngine.totalPdfFiles,
    uploadEngineUploaded: uploadEngine.uploadedPdfFiles,
    uploadEngineUploading: uploadEngine.uploadingFiles.size
  });

  // Enhanced status determination function with local state priority
  const getFileStatus = (filename: string, fileInfo: any) => {
    const isInUploadingSet = uploadEngine.uploadingFiles.has(filename);
    const backendStatus = fileInfo.status;
    const localStatus = localFileStatuses[filename];
    
    // Priority: Local status > Upload engine state > Backend status
    // This ensures immediate UI feedback for status changes
    let currentStatus = backendStatus;
    
    // If we have a local status, use it (most up-to-date)
    if (localStatus) {
      currentStatus = localStatus;
    }
    // If file is in uploading set but no local status, mark as uploading
    else if (isInUploadingSet && (!currentStatus || currentStatus === 'pending')) {
      currentStatus = 'uploading';
    }
    
    console.log(`📊 Status for ${filename}: local="${localStatus}", backend="${backendStatus}", uploading=${isInUploadingSet}, final="${currentStatus}"`);
    
    // Enhanced status determination with better colors and icons
    if (currentStatus === 'uploaded') {
      return {
        status: 'uploaded',
        icon: '✅',
        color: '#10b981', // emerald-500
        bgColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: 'rgba(16, 185, 129, 0.3)',
        label: 'Completed'
      };
    } else if (currentStatus === 'upload-failed') {
      return {
        status: 'failed',
        icon: '❌',
        color: '#ef4444', // red-500
        bgColor: 'rgba(239, 68, 68, 0.1)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
        label: 'Failed'
      };
    } else if (currentStatus === 'processing') {
      return {
        status: 'processing',
        icon: '⚙️',
        color: '#f59e0b', // amber-500
        bgColor: 'rgba(245, 158, 11, 0.1)',
        borderColor: 'rgba(245, 158, 11, 0.3)',
        label: 'Processing'
      };
    } else if (currentStatus === 'uploading') {
      return {
        status: 'uploading',
        icon: '📤',
        color: '#3b82f6', // blue-500
        bgColor: 'rgba(59, 130, 246, 0.1)',
        borderColor: 'rgba(59, 130, 246, 0.3)',
        label: 'Uploading'
      };
    } else {
      return {
        status: 'pending',
        icon: '⏳',
        color: '#6b7280', // gray-500
        bgColor: 'rgba(107, 114, 128, 0.1)',
        borderColor: 'rgba(107, 114, 128, 0.3)',
        label: 'Pending'
      };
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 30%, #2d2d2d 70%, #000000 100%)',
      color: '#e2e8f0',
      padding: '2rem 1rem'
    }}>
      <div style={{ 
        maxWidth: '1200px', 
        margin: '0 auto'
      }}>
        {/* Job Header */}
        <div style={{ marginBottom: 32 }}>
          <JobHeader jobData={jobData} />
        </div>

        {/* Enhanced Upload Progress Card */}
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          padding: '2rem', 
          borderRadius: '20px', 
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          marginBottom: '2rem'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ 
              margin: '0', 
              color: '#ffffff',
              fontSize: '1.5rem',
              fontWeight: '700',
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              File Upload Progress
            </h3>
            
            <div style={{
              background: progressPercentage === 100 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '12px',
              fontSize: '0.9rem',
              fontWeight: '600',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
            }}>
              {Math.round(progressPercentage)}%
            </div>
          </div>
          
          {/* Enhanced Progress Bar */}
          <div style={{ 
            width: '100%', 
            background: 'rgba(255, 255, 255, 0.1)', 
            borderRadius: '16px', 
            overflow: 'hidden',
            marginBottom: '1.5rem',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            position: 'relative'
          }}>
            <div 
              style={{ 
                width: `${progressPercentage}%`,
                height: '32px',
                background: progressPercentage === 100 
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '14px',
                fontWeight: '700',
                borderRadius: '15px',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Animated shimmer effect for active uploads */}
              {currentStep === 'uploading' && progressPercentage < 100 && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: '-100%',
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
                  animation: 'shimmer 2s infinite'
                }} />
              )}
              {/* Removed uploaded/total text from progress bar for cleaner look */}
            </div>
          </div>

          {/* Enhanced Status Text */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: '#e2e8f0', fontSize: '1rem', fontWeight: '500' }}>
              {currentStep === 'creating-files' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>📝</span>
                  <span>Creating files...</span>
                </span>
              )}
              {currentStep === 'uploading' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>📤</span>
                  <span>Uploading files... ({uploadedFiles}/{totalFiles})</span>
                </span>
              )}
              {currentStep === 'completed' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981' }}>
                  <span>✅</span>
                  <span>Upload completed! Redirecting to jobs list...</span>
                </span>
              )}
            </div>
          </div>
          
          {/* Upload Warning - positioned below status text as separate block */}
          {currentStep === 'uploading' && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '12px',
              padding: '1rem',
              marginTop: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <div style={{
                fontSize: '1.25rem',
                color: '#f59e0b'
              }}>
                ⚠️
              </div>
              <div>
                <div style={{ 
                  color: '#f59e0b', 
                  fontWeight: '600', 
                  marginBottom: '0.25rem',
                  fontSize: '0.9rem'
                }}>
                  Do not navigate away
                </div>
                <div style={{ 
                  color: 'rgba(245, 158, 11, 0.8)', 
                  fontSize: '0.85rem',
                  lineHeight: '1.4'
                }}>
                  Please keep this page open while files are uploading. Navigating away or closing the browser may interrupt the upload process.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Enhanced PDF File Status List */}
        {(createdFiles.length > 0 || currentStep === 'creating-files') && (
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            padding: '2rem', 
            borderRadius: '20px', 
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem'
            }}>
              <h4 style={{ 
                margin: '0',
                color: '#ffffff',
                fontSize: '1.25rem',
                fontWeight: '700'
              }}>
                PDF Files
              </h4>
              <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#e2e8f0',
                padding: '0.5rem 1rem',
                borderRadius: '12px',
                fontSize: '0.9rem',
                fontWeight: '600'
              }}>
                {createdFiles.reduce((total: number, fileGroup: any) => 
                  total + Object.keys(fileGroup.original_files || {}).length, 0
                )} files
              </div>
            </div>

            <div style={{ maxHeight: '500px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              <div style={{ display: 'grid', gap: '1rem' }}>
                {createdFiles.flatMap((fileGroup: any, groupIndex: number) => 
                  Object.entries(fileGroup.original_files || {}).map(([filename, fileInfo]: [string, any]) => {
                    const statusInfo = getFileStatus(filename, fileInfo);
                    
                    return (
                      <div 
                        key={`${groupIndex}-${filename}`}
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: `1px solid ${statusInfo.borderColor}`,
                          borderRadius: '16px',
                          padding: '1.25rem',
                          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        {/* Background gradient based on status */}
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: statusInfo.bgColor,
                          opacity: 0.5
                        }} />
                        
                        <div style={{ 
                          position: 'relative',
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center'
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ 
                              fontSize: '1rem', 
                              fontWeight: '600',
                              color: '#ffffff',
                              marginBottom: '0.5rem'
                            }}>
                              {filename}
                            </div>
                            <div style={{ 
                              fontSize: '0.85rem', 
                              color: 'rgba(255, 255, 255, 0.7)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              <span>{fileInfo.card_type ? `${fileInfo.card_type} side` : 'PDF file'}</span>
                              {fileGroup.filename && (
                                <>
                                  <span>•</span>
                                  <span>Group: {fileGroup.filename}</span>
                                </>
                              )}
                            </div>
                          </div>
                          
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.75rem' 
                          }}>
                            {/* Status Badge */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              background: statusInfo.bgColor,
                              border: `1px solid ${statusInfo.borderColor}`,
                              color: statusInfo.color,
                              padding: '0.5rem 1rem',
                              borderRadius: '12px',
                              fontSize: '0.875rem',
                              fontWeight: '600',
                              minWidth: '120px',
                              justifyContent: 'center'
                            }}>
                              <span style={{ fontSize: '1rem' }}>{statusInfo.icon}</span>
                              <span>{statusInfo.label}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              
              {(createdFiles.length === 0) && (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '3rem', 
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontSize: '1rem'
                }}>
                  {currentStep === 'creating-files' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                      <Spinner />
                      <span>Creating files...</span>
                    </div>
                  ) : (
                    'No files found'
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Add CSS animations */}
      <style jsx>{`
        @keyframes shimmer {
          0% { left: -100%; }
          100% { left: 100%; }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        /* Custom scrollbar */
        div::-webkit-scrollbar {
          width: 8px;
        }
        
        div::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        
        div::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 4px;
        }
        
        div::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
      `}</style>
    </div>
  );
}

export default function JobUploadingPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <Spinner />
      </div>
    }>
      <JobUploadingContent />
    </Suspense>
  );
}