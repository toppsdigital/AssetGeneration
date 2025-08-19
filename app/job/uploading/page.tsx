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

  // Debug createdFiles state changes
  useEffect(() => {
    console.log('📋 createdFiles state updated:', {
      length: createdFiles.length,
      fileGroups: createdFiles.map(fg => fg.filename),
      totalPdfs: createdFiles.reduce((total, fg) => total + Object.keys(fg.original_files || {}).length, 0)
    });
  }, [createdFiles]);

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
    }
  });

  // Debug upload engine state
  useEffect(() => {
    console.log('🔧 Upload engine state:', {
      uploadStarted: uploadEngine.uploadStarted,
      totalPdfFiles: uploadEngine.totalPdfFiles,
      uploadedPdfFiles: uploadEngine.uploadedPdfFiles,
      uploadingFilesCount: uploadEngine.uploadingFiles.size,
      uploadingFilesList: Array.from(uploadEngine.uploadingFiles)
    });
  }, [uploadEngine.uploadStarted, uploadEngine.totalPdfFiles, uploadEngine.uploadedPdfFiles, uploadEngine.uploadingFiles]);

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
    if (currentStep === 'creating-files' && jobData && uploadSession) {
      createFiles();
    }
  }, [currentStep, jobData, uploadSession]);

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
        wrongStep: currentStep !== 'uploading',
        noJobData: !jobData,
        noCreatedFiles: createdFiles.length === 0,
        createdFilesEmpty: createdFiles.length === 0
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
              status: 'uploading', // Start with uploading status
              card_type: pdf.type,
              file_path: filePath, // Proper S3 path format
              last_updated: new Date().toISOString()
            };
            
            console.log(`📄 Created file with path: ${filePath} (status: uploading)`);
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
      if (createFilesResponse && createFilesResponse.created_files) {
        console.log('📦 Storing created files from batch_create_files response:', createFilesResponse.created_files);
        setCreatedFiles(createFilesResponse.created_files);
      } else if (createFilesResponse && createFilesResponse.files) {
        console.log('📦 Storing created files from response.files:', createFilesResponse.files);
        setCreatedFiles(createFilesResponse.files);
      } else if (createFilesResponse && createFilesResponse.data && createFilesResponse.data.created_files) {
        console.log('📦 Storing created files from response.data.created_files:', createFilesResponse.data.created_files);
        setCreatedFiles(createFilesResponse.data.created_files);
      } else if (createFilesResponse && Array.isArray(createFilesResponse)) {
        console.log('📦 Response is array, using directly:', createFilesResponse);
        setCreatedFiles(createFilesResponse);
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
      
      // Start uploading immediately - no delay or refresh needed
      console.log('📤 Transitioning to uploading step');
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

  // Calculate actual file counts from created files for accuracy
  const totalFiles = createdFiles.reduce((total: number, fileGroup: any) => 
    total + Object.keys(fileGroup.original_files || {}).length, 0
  );
  const uploadedFiles = uploadEngine.uploadedPdfFiles || 0;
  
  console.log('📊 Progress calculation:', {
    createdFilesLength: createdFiles.length,
    totalFiles,
    uploadedFiles,
    uploadEngineTotal: uploadEngine.totalPdfFiles,
    uploadEngineUploaded: uploadEngine.uploadedPdfFiles
  });

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

        {/* Upload Progress */}
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          padding: '1.5rem', 
          borderRadius: '16px', 
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          marginBottom: '1.5rem'
        }}>
          <h3 style={{ 
            margin: '0 0 1rem 0', 
            color: '#ffffff',
            fontSize: '1.25rem',
            fontWeight: '600'
          }}>
            File Upload Progress
          </h3>
          
          {/* Progress Bar */}
          <div style={{ 
            width: '100%', 
            background: 'rgba(255, 255, 255, 0.1)', 
            borderRadius: '12px', 
            overflow: 'hidden',
            marginBottom: '1rem',
            border: '1px solid rgba(255, 255, 255, 0.15)'
          }}>
            <div 
              style={{ 
                width: `${totalFiles > 0 ? (uploadedFiles / totalFiles) * 100 : 0}%`,
                height: '28px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                transition: 'width 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '14px',
                fontWeight: 'bold',
                borderRadius: '11px'
              }}
            >
              {totalFiles > 0 && `${uploadedFiles}/${totalFiles}`}
            </div>
          </div>

          {/* Status Text */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: '#e2e8f0', fontSize: '0.95rem' }}>
              {currentStep === 'creating-files' && (
                <span>📝 Creating files...</span>
              )}
              {currentStep === 'uploading' && (
                <span>📤 Uploading files... ({uploadedFiles}/{totalFiles})</span>
              )}
              {currentStep === 'completed' && (
                <span>✅ Upload completed! Redirecting to jobs list...</span>
              )}
            </div>
            
            {currentStep === 'uploading' && (
              <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                {uploadEngine.uploadingFiles.size > 0 && (
                  <span>Processing: {uploadEngine.uploadingFiles.size} files</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* PDF File Status List */}
        {(createdFiles.length > 0 || currentStep === 'creating-files') && (
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            padding: '1.5rem', 
            borderRadius: '16px', 
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
          }}>
            <h4 style={{ 
              margin: '0 0 1rem 0',
              color: '#ffffff',
              fontSize: '1.1rem',
              fontWeight: '600'
            }}>
              PDF Files ({createdFiles.reduce((total: number, fileGroup: any) => 
                total + Object.keys(fileGroup.original_files || {}).length, 0
              )})
            </h4>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {createdFiles.flatMap((fileGroup: any, groupIndex: number) => 
              Object.entries(fileGroup.original_files || {}).map(([filename, fileInfo]: [string, any]) => {
                // Determine current status
                let status = 'pending';
                let statusIcon = '⏳';
                let statusColor = '#666';
                
                const isInUploadingSet = uploadEngine.uploadingFiles.has(filename);
                const backendStatus = fileInfo.status;
                
                // Priority: uploadingFiles set > backend status for real-time UI
                if (backendStatus === 'uploaded') {
                  status = 'uploaded';
                  statusIcon = '✅';
                  statusColor = '#28a745';
                } else if (backendStatus === 'upload-failed') {
                  status = 'failed';
                  statusIcon = '❌';
                  statusColor = '#dc3545';
                } else if (isInUploadingSet) {
                  // File is actively being processed
                  if (backendStatus === 'processing') {
                    status = 'processing';
                    statusIcon = '⚙️';
                    statusColor = '#ffc107';
                  } else {
                    status = 'uploading';
                    statusIcon = '📤';
                    statusColor = '#007bff';
                  }
                } else if (backendStatus === 'processing') {
                  status = 'processing';
                  statusIcon = '⚙️';
                  statusColor = '#ffc107';
                } else if (backendStatus === 'uploading') {
                  status = 'uploading';
                  statusIcon = '📤';
                  statusColor = '#007bff';
                } else {
                  // Default to pending
                  status = 'pending';
                  statusIcon = '⏳';
                  statusColor = '#666';
                }
                
                return (
                  <div 
                    key={`${groupIndex}-${filename}`}
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '0.75rem 1rem',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '8px',
                      marginBottom: '0.5rem',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontSize: '14px', 
                        fontWeight: '500',
                        color: '#e2e8f0'
                      }}>
                        {filename}
                      </div>
                      <div style={{ 
                        fontSize: '12px', 
                        color: 'rgba(255, 255, 255, 0.6)', 
                        marginTop: '2px' 
                      }}>
                        {fileInfo.card_type ? `${fileInfo.card_type} side` : 'PDF file'}
                        {fileGroup.filename && ` • Group: ${fileGroup.filename}`}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span 
                        style={{ 
                          fontSize: '12px', 
                          fontWeight: '500',
                          color: statusColor,
                          minWidth: '100px', 
                          textAlign: 'right',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '4px'
                        }}
                      >
                        <span>{statusIcon}</span>
                        <span style={{ textTransform: 'capitalize' }}>{status}</span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            
            {(createdFiles.length === 0) && (
              <div style={{ 
                textAlign: 'center', 
                padding: '2rem', 
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '0.95rem'
              }}>
                {currentStep === 'creating-files' ? 'Creating files...' : 'No files found'}
              </div>
            )}
          </div>
        </div>
      )}
      </div>
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