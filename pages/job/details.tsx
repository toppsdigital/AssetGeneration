import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
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
  const { jobId, startUpload } = router.query;
  
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);

  useEffect(() => {
    if (jobId) {
      loadJobDetails();
    }
  }, [jobId]);

  // Load file objects after job details are loaded
  useEffect(() => {
    if (jobData && jobData.api_files && jobData.api_files.length > 0 && !filesLoaded) {
      if (jobData.job_status === 'Upload in progress' || jobData.job_status === 'Upload started') {
        // Create new file objects for jobs that are starting upload
        createNewFiles();
      } else {
        // Load existing file objects for jobs that already have them
        loadExistingFiles();
      }
    }
  }, [jobData, filesLoaded]);



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
        original_files: apiFile.metadata?.original_files || {},
        extracted_files: apiFile.metadata?.extracted_files || [],
        firefly_assets: apiFile.metadata?.firefly_assets || []
      }));
      
      // Update job data with fetched files
      const updatedJobData = {
        ...jobData,
        content_pipeline_files: fileObjects
      };
      
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
    if (!jobData || !jobData.api_files || jobData.api_files.length === 0) return;
    
    try {
      setLoadingFiles(true);
      console.log('Creating file objects for:', jobData.api_files);
      
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
      
      // Create FileData objects for the API
      const apiFileData: FileData[] = fileObjects.map(fileObj => ({
        filename: fileObj.filename,
        status: 'Uploading',
        metadata: {
          job_id: jobData.job_id,
          original_files: fileObj.original_files
        }
      }));
      
      // Batch create files
      const batchResponse = await contentPipelineApi.batchCreateFiles(apiFileData);
      
      console.log('Batch create response:', batchResponse);
      
      // Update job data with created files
      const updatedJobData = {
        ...jobData,
        content_pipeline_files: fileObjects
      };
      
      setJobData(updatedJobData);
      setFilesLoaded(true);
      setLoadingFiles(false);
      
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
      
      // Map API response to our local interface
      const mappedJobData: JobData = {
        ...response.job,
        api_files: response.job.files, // Store API files separately
        files: jobData?.files || [], // Preserve existing legacy files
        content_pipeline_files: jobData?.content_pipeline_files || [], // Preserve existing Content Pipeline files
        Subset_name: response.job.source_folder // Map source_folder to Subset_name for UI compatibility
      };
      
      setJobData(mappedJobData);
    } catch (error) {
      console.error('Error updating job status:', error);
      throw error;
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
                                        <span>{filename}</span>
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
    </div>
  );
} 