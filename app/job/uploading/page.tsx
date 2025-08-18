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

  // Fetch job data (likely cached from just created job) 
  const { 
    data: jobData, 
    isLoading: jobLoading, 
    error: jobError, 
    mutate: mutateJob,
    refresh: refreshJobData
  } = useAppDataStore('jobDetails', { 
    jobId: jobId || '', 
    includeFiles: true, // Need files for upload - will only fetch after they're created
    autoRefresh: false // Disabled to prevent unnecessary calls
  });

  // Upload engine for processing and uploading files  
  const uploadEngine = useUploadEngine({ 
    jobData, 
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

  // Start upload when we transition to uploading step and have job data with files
  useEffect(() => {
    console.log('🔍 Upload effect triggered:', {
      currentStep,
      hasJobData: !!jobData,
      hasFiles: !!jobData?.content_pipeline_files,
      filesCount: jobData?.content_pipeline_files?.length || 0,
      uploadStarted: uploadEngine.uploadStarted,
      jobId: jobData?.job_id,
      hasPendingFiles: !!(window as any).pendingUploadFiles,
      pendingFilesJobId: (window as any).pendingUploadFiles?.jobId,
      pendingFilesCount: (window as any).pendingUploadFiles?.files?.length || 0
    });

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

    if (currentStep === 'uploading' && jobData?.content_pipeline_files && jobData.content_pipeline_files.length > 0) {
      console.log('🚀 Attempting to start upload with files:', jobData.content_pipeline_files.length);
      console.log('📂 File groups:', jobData.content_pipeline_files.map(fg => ({
        filename: fg.filename,
        originalFilesCount: Object.keys(fg.original_files || {}).length
      })));
      
      // Check if upload engine is ready
      if (!uploadEngine.uploadStarted) {
        console.log('🎯 Calling uploadEngine.checkAndStartUpload(true)');
        uploadEngine.checkAndStartUpload(true).catch(uploadError => {
          console.error('❌ Upload failed to start:', uploadError);
          setError(uploadError instanceof Error ? uploadError.message : 'Failed to start upload');
          setCurrentStep('error');
        });
      } else {
        console.log('⚠️ Upload already started, skipping');
      }
    } else {
      console.log('⏸️ Upload not ready:', {
        wrongStep: currentStep !== 'uploading',
        noJobData: !jobData,
        noFiles: !jobData?.content_pipeline_files,
        filesEmpty: jobData?.content_pipeline_files?.length === 0
      });
    }
  }, [currentStep, jobData?.content_pipeline_files, uploadEngine, jobId]);

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

      // Create files using useAppDataStore mutation
      await mutateJob({
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
      
      // Small delay for backend to process
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Single refresh to get created files for upload engine (no choice here)
      console.log('🔄 Refreshing job data once to get created files for upload engine');
      await refreshJobData();
      
      // Start uploading
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

  // Calculate actual file counts from job data for accuracy
  const totalFiles = (jobData?.content_pipeline_files || []).reduce((total: number, fileGroup: any) => 
    total + Object.keys(fileGroup.original_files || {}).length, 0
  );
  const uploadedFiles = uploadEngine.uploadedPdfFiles || 0;

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
        {(jobData?.content_pipeline_files || currentStep === 'creating-files') && (
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
              PDF Files ({(jobData?.content_pipeline_files || []).reduce((total: number, fileGroup: any) => 
                total + Object.keys(fileGroup.original_files || {}).length, 0
              )})
            </h4>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {(jobData.content_pipeline_files || []).flatMap((fileGroup: any, groupIndex: number) => 
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
            
            {(!jobData?.content_pipeline_files || jobData.content_pipeline_files.length === 0) && (
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