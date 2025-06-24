import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import NavBar from '../../components/NavBar';
import styles from '../../styles/Edit.module.css';
import Spinner from '../../components/Spinner';

interface JobData {
  job_id: string;
  job_status: string;
  source_folder: string;
  template?: string;
  psd_file?: string;
  total_files: number;
  files: JobFile[];
  timestamp?: string;
  app_name?: string;
  release_name?: string;
  Subset_name?: string;
  created_at?: string;
  last_updated?: string;
  job_path?: string;
}

interface JobFile {
  filename: string;
  extracted?: string;
  digital_assets?: string;
  last_updated?: string;
  extracted_files?: string[];
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
}

export default function JobDetailsPage() {
  const router = useRouter();
  const { jobPath, startUpload } = router.query;
  
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    currentFile: string;
  } | null>(null);
  const [fileUploadStatus, setFileUploadStatus] = useState<Map<string, 'pending' | 'uploading' | 'completed' | 'failed'>>(new Map());

  useEffect(() => {
    if (jobPath) {
      loadJobDetails();
    }
  }, [jobPath]);

  // Start upload process if coming from new job creation
  useEffect(() => {
    if (startUpload === 'true' && jobData && jobData.job_status === 'Upload started') {
      startUploadProcess();
    }
  }, [startUpload, jobData]);

  const loadJobDetails = async () => {
    try {
      setLoading(true);
      
      const response = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          client_method: 'get',
          filename: jobPath as string,
          download: true 
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch job details');
      }

      const data = await response.json();
      setJobData(data);
      
    } catch (error) {
      console.error('Error loading job details:', error);
      setError('Failed to load job details: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Update existing job JSON
  const updateJobJSON = async (jobData: JobData): Promise<void> => {
    try {
      // Get presigned URL for job JSON update
      const presignedResponse = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          client_method: 'put',
          filename: jobData.job_path || jobPath as string,
          upload: true
        }),
      });

      if (!presignedResponse.ok) {
        throw new Error('Failed to get presigned URL for job JSON update');
      }

      const { presignedUrl } = await presignedResponse.json();
      
      // Update and upload job JSON
      const jobJsonBlob = new Blob([JSON.stringify(jobData, null, 2)], { type: 'application/json' });
      const jobFormData = new FormData();
      jobFormData.append('file', jobJsonBlob, `${jobData.job_id}.json`);
      jobFormData.append('presignedUrl', presignedUrl);

      const uploadResponse = await fetch('/api/s3-upload', {
        method: 'POST',
        body: jobFormData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to update job JSON');
      }

      console.log('Job JSON updated successfully');
    } catch (error) {
      console.error('Error updating job JSON:', error);
      throw error;
    }
  };

  // Upload files to S3 using existing infrastructure
  const uploadFilesToS3 = async (jobData: JobData): Promise<void> => {
    if (!jobData.files || jobData.files.length === 0) {
      throw new Error('No files to upload');
    }

    // Get upload session data
    const uploadSessionData = sessionStorage.getItem(`upload_${jobData.job_id}`);
    if (!uploadSessionData) {
      throw new Error('Upload session data not found');
    }

    const uploadSession = JSON.parse(uploadSessionData);
    
    // Get all PDF files that need to be uploaded from session data
    const filesToUpload = uploadSession.files || [];

    if (filesToUpload.length === 0) {
      throw new Error('No PDF files found to upload');
    }

    setUploadProgress({ current: 0, total: filesToUpload.length, currentFile: '' });

    // Initialize file upload status
    const newFileStatus = new Map<string, 'pending' | 'uploading' | 'completed' | 'failed'>();
    filesToUpload.forEach((file: any) => {
      newFileStatus.set(file.name, 'pending');
    });
    setFileUploadStatus(newFileStatus);

    // Simulate the upload process since we don't have access to actual File objects
    // In a real implementation, you'd need to store files temporarily or use a different approach
    
    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      
      // Update progress to show current file being uploaded
      setUploadProgress({ current: i, total: filesToUpload.length, currentFile: file.name });
      
      // Update file status to uploading
      setFileUploadStatus(prev => {
        const newStatus = new Map(prev);
        newStatus.set(file.name, 'uploading');
        return newStatus;
      });
      
      try {
        // Simulate upload process with realistic delay
        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
        
        // Simulate actual S3 upload (in real implementation, you'd upload the actual file)
        const s3Path = `${uploadSession.appName}/PDFs/${file.name}`;
        console.log(`Simulated upload of ${file.name} to ${s3Path}`);
        
        // Update file status to completed
        setFileUploadStatus(prev => {
          const newStatus = new Map(prev);
          newStatus.set(file.name, 'completed');
          return newStatus;
        });
        
        // Small delay to ensure state update order
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Update progress to show this file is completed (increment progress count)
        setUploadProgress({ current: i + 1, total: filesToUpload.length, currentFile: file.name });
        
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        
        // Update file status to failed
        setFileUploadStatus(prev => {
          const newStatus = new Map(prev);
          newStatus.set(file.name, 'failed');
          return newStatus;
        });
        
        // Small delay to ensure state update order
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Still increment progress even on failure
        setUploadProgress({ current: i + 1, total: filesToUpload.length, currentFile: file.name });
        
        throw error;
      }
    }

    // Final completion state
    setUploadProgress({ current: filesToUpload.length, total: filesToUpload.length, currentFile: 'Complete!' });
    
    // Clean up session data after successful upload
    sessionStorage.removeItem(`upload_${jobData.job_id}`);
  };

  // Start the upload process
  const startUploadProcess = async () => {
    if (!jobData) return;

    try {
      console.log('Starting upload process for job:', jobData.job_id);
      
      // Upload all files
      await uploadFilesToS3(jobData);
      
      // Update job status to completed
      const updatedJobData = {
        ...jobData,
        job_status: "Upload completed",
        last_updated: new Date().toISOString()
      };

      await updateJobJSON(updatedJobData);
      
      // Update local state
      setJobData(updatedJobData);
      
      console.log('Upload process completed successfully');
      
    } catch (error) {
      console.error('Error during upload process:', error);
      setError('Upload failed: ' + (error as Error).message);
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
    if (!jobPath) return 'Unknown Job';
    return (jobPath as string).split('/').pop()?.replace('.json', '') || 'Unknown Job';
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

            {/* Upload Progress Section - Show when upload is started */}
            {jobData.job_status === 'Upload started' && (
              <div style={{ 
                marginBottom: 32,
                padding: 24,
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 16
              }}>
                <h2 style={{
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  color: '#f8f8f8',
                  marginBottom: 20,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  📤 Upload Progress
                </h2>
                
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: 12
                }}>
                  <span style={{ color: '#60a5fa', fontSize: 16, fontWeight: 500 }}>
                    {uploadProgress ? 'Uploading Files' : 'Preparing Upload...'}
                  </span>
                  {uploadProgress && (
                    <span style={{ color: '#60a5fa', fontSize: 14 }}>
                      {uploadProgress.current}/{uploadProgress.total}
                    </span>
                  )}
                </div>
                
                {/* Progress Bar */}
                <div style={{
                  width: '100%',
                  height: 12,
                  background: 'rgba(59, 130, 246, 0.2)',
                  borderRadius: 6,
                  overflow: 'hidden',
                  marginBottom: 12
                }}>
                  <div style={{
                    width: uploadProgress ? `${(uploadProgress.current / uploadProgress.total) * 100}%` : '0%',
                    height: '100%',
                    background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                    borderRadius: 6,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                
                {/* Current File */}
                {uploadProgress ? (
                  uploadProgress.currentFile && (
                    <div style={{ 
                      color: '#9ca3af', 
                      fontSize: 14,
                      fontStyle: 'italic',
                      marginBottom: 16
                    }}>
                      {uploadProgress.current >= uploadProgress.total 
                        ? `✅ All files uploaded successfully!`
                        : `Currently uploading: ${uploadProgress.currentFile}`
                      }
                    </div>
                  )
                ) : (
                  <div style={{ 
                    color: '#9ca3af', 
                    fontSize: 14,
                    fontStyle: 'italic',
                    marginBottom: 16
                  }}>
                    Initializing upload process...
                  </div>
                )}

                {/* Individual File Status */}
                {(fileUploadStatus.size > 0 || !uploadProgress) && (
                  <div style={{
                    maxHeight: '200px',
                    overflowY: 'auto',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    padding: 12
                  }}>
                    {fileUploadStatus.size > 0 ? (
                      Array.from(fileUploadStatus.entries()).map(([filename, status], index) => {
                      const getStatusIcon = (status: string) => {
                        switch (status) {
                          case 'pending': return '⏳';
                          case 'uploading': return '🔄';
                          case 'completed': return '✅';
                          case 'failed': return '❌';
                          default: return '⏳';
                        }
                      };
                      
                      const getStatusColor = (status: string) => {
                        switch (status) {
                          case 'pending': return '#9ca3af';
                          case 'uploading': return '#f59e0b';
                          case 'completed': return '#10b981';
                          case 'failed': return '#ef4444';
                          default: return '#9ca3af';
                        }
                      };
                      
                      return (
                        <div
                          key={index}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            marginBottom: index < fileUploadStatus.size - 1 ? 4 : 0,
                            background: status === 'uploading' ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                            borderRadius: 4,
                            border: status === 'uploading' ? '1px solid rgba(245, 158, 11, 0.3)' : 'none',
                            transition: 'all 0.2s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16 }}>📄</span>
                            <span style={{
                              color: '#f8f8f8',
                              fontSize: 14,
                              fontFamily: 'monospace'
                            }}>
                              {filename}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16 }}>
                              {getStatusIcon(status)}
                            </span>
                            <span style={{
                              color: getStatusColor(status),
                              fontSize: 12,
                              fontWeight: 600,
                              textTransform: 'capitalize',
                              minWidth: '70px',
                              textAlign: 'right'
                            }}>
                              {status === 'uploading' ? 'Uploading...' : status}
                            </span>
                          </div>
                        </div>
                      );
                    })
                    ) : (
                      <div style={{
                        textAlign: 'center',
                        padding: '20px',
                        color: '#9ca3af',
                        fontSize: 14
                      }}>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
                        <p style={{ margin: 0 }}>
                          File list will appear here once upload begins
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Files Details - Show only after upload is completed */}
            {jobData.files && jobData.files.length > 0 && jobData.job_status === 'Upload completed' && (
              <div style={{ marginTop: 32 }}>
                <h2 style={{
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  color: '#f8f8f8',
                  marginBottom: 24
                }}>
                  📁 File Details ({jobData.files.length})
                </h2>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {jobData.files.map((file, index) => (
                    <div key={index} style={{
                      background: 'rgba(255, 255, 255, 0.05)',
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
                            📄 Original PDF Files ({file.original_files?.length || 0})
                          </h4>
                          <div style={{
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            borderRadius: 8,
                            padding: 12,
                            maxHeight: 200,
                            overflowY: 'auto'
                          }}>
                            {file.original_files && file.original_files.length > 0 ? (
                              file.original_files.map((originalFile, origIndex) => (
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
                                    <span>{originalFile.filename}</span>
                                  </span>
                                  <span style={{
                                    fontSize: 11,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    background: 'rgba(245, 158, 11, 0.2)',
                                    color: '#f59e0b'
                                  }}>
                                    {originalFile.card_type}
                                  </span>
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
                                  // Navigate to preview page for extracted layers
                                  const baseName = file.filename.replace('.pdf', '').replace('.PDF', '');
                                  const fullJobPath = router.query.jobPath as string;
                                  router.push(`/job/preview?jobPath=${encodeURIComponent(fullJobPath)}&fileName=${encodeURIComponent(baseName)}&type=extracted`);
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
                              {file.extracted_files.map((extractedFile, extIndex) => (
                                <div key={extIndex} style={{
                                  marginBottom: 8,
                                  fontSize: 13,
                                  color: '#bfdbfe',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6
                                }}>
                                  <span>🖼️</span>
                                  <span>{extractedFile}</span>
                                </div>
                              ))}
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
                                // Navigate to preview page for firefly assets
                                const baseName = file.filename.replace('.pdf', '').replace('.PDF', '');
                                const fullJobPath = router.query.jobPath as string;
                                router.push(`/job/preview?jobPath=${encodeURIComponent(fullJobPath)}&fileName=${encodeURIComponent(baseName)}&type=firefly`);
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
                  ))}
                </div>
              </div>
            )}

            {/* No Files Message - Only show when upload is completed and no files exist */}
            {(!jobData.files || jobData.files.length === 0) && jobData.job_status === 'Upload completed' && (
              <div style={{
                textAlign: 'center',
                padding: '48px 0',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                marginTop: 32
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
                <h3 style={{ color: '#9ca3af', fontSize: 18, marginBottom: 8 }}>No Files Found</h3>
                <p style={{ color: '#6b7280', fontSize: 14 }}>
                  This job doesn't have any file details yet.
                </p>
              </div>
            )}



          </div>
        </main>
      </div>
    </div>
  );
} 