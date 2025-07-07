'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense } from 'react';
import NavBar from '../../../components/NavBar';
import styles from '../../../styles/Edit.module.css';
import Spinner from '../../../components/Spinner';
import { contentPipelineApi, JobData as APIJobData, FileData } from '../../../web/utils/contentPipelineApi';

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

function JobDetailsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const jobId = searchParams.get('jobId');
  const startUpload = searchParams.get('startUpload');
  const appName = searchParams.get('appName');
  const releaseName = searchParams.get('releaseName');
  const sourceFolder = searchParams.get('sourceFolder');
  const status = searchParams.get('status');
  const createdAt = searchParams.get('createdAt');
  const files = searchParams.get('files');
  const description = searchParams.get('description');
  
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [uploadStarted, setUploadStarted] = useState(false);

  useEffect(() => {
    if (jobId) {
      // Debug: Check if pending files are available
      console.log('🔍 Initial page load - checking pending files:', {
        jobId,
        pendingFiles: (window as any).pendingUploadFiles ? {
          jobId: (window as any).pendingUploadFiles.jobId,
          filesCount: (window as any).pendingUploadFiles.files?.length || 0,
          fileNames: (window as any).pendingUploadFiles.files?.map((f: File) => f.name) || []
        } : null
      });
      
      // Check if we have job data from query params to avoid API call
      if (appName && releaseName && sourceFolder && status) {
        loadJobDetailsFromParams();
      } else {
        loadJobDetails();
      }
    }
  }, [jobId, appName, releaseName, sourceFolder, status]);

  // Load file objects after job details are loaded
  useEffect(() => {
    console.log('🔄 useEffect[jobData, filesLoaded] triggered at', new Date().toISOString(), ':', { 
      hasJobData: !!jobData, 
      hasApiFiles: !!jobData?.api_files?.length, 
      filesLoaded, 
      jobStatus: jobData?.job_status,
      uploadStarted
    });
    
    // Don't reload files if upload has started - this prevents overwriting status updates
    if (uploadStarted) {
      console.log('🔄 Skipping file loading - upload in progress, avoiding status overwrites');
      return;
    }
    
    if (jobData && jobData.api_files && jobData.api_files.length > 0 && !filesLoaded) {
      console.log('🔄 Loading files - condition met');
      if (jobData.job_status === 'Upload in progress' || jobData.job_status === 'Upload started') {
        // Create new file objects for jobs that are starting upload
        console.log('🔄 Calling createNewFiles');
        createNewFiles();
      } else {
        // Load existing file objects for jobs that already have them
        console.log('🔄 Calling loadExistingFiles');
        loadExistingFiles();
      }
    } else {
      console.log('🔄 Skipping file loading - condition not met');
    }
  }, [jobData, filesLoaded]);

  // Load job details from query parameters (for new jobs)
  const loadJobDetailsFromParams = async () => {
    try {
      console.log('📋 Loading job details from URL parameters...');
      
      let parsedFiles: string[] = [];
      if (files) {
        try {
          parsedFiles = JSON.parse(files);
        } catch (e) {
          console.warn('Failed to parse files from URL params:', e);
        }
      }

      const jobDataFromParams: JobData = {
        job_id: jobId!,
        job_status: status!,
        app_name: appName!,
        release_name: releaseName!,
        source_folder: sourceFolder!,
        description: description || '',
        created_at: createdAt || new Date().toISOString(),
        api_files: parsedFiles
      };

      console.log('✅ Job details loaded from params:', jobDataFromParams);
      setJobData(jobDataFromParams);
      setLoading(false);
      
    } catch (err) {
      console.error('❌ Error loading job details from params:', err);
      setError((err as Error).message);
      setLoading(false);
    }
  };

  // Load job details from API
  const loadJobDetails = async () => {
    if (!jobId) return;

    try {
      console.log(`📋 Loading job details from API for job: ${jobId}`);
      setLoading(true);
      setError(null);

      const response = await contentPipelineApi.getJob(jobId);
      console.log('✅ Job details loaded from API:', response.job);

      const jobDataFromAPI: JobData = {
        job_id: response.job.job_id,
        job_status: response.job.job_status,
        app_name: response.job.app_name,
        release_name: response.job.release_name,
        source_folder: response.job.source_folder,
        description: response.job.description,
        progress_percentage: response.job.progress_percentage,
        current_step: response.job.current_step,
        created_at: response.job.created_at,
        last_updated: response.job.last_updated,
        api_files: response.job.files || []
      };

      setJobData(jobDataFromAPI);
    } catch (err) {
      console.error('❌ Error loading job details:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Additional methods for file handling, upload processing, etc.
  const createNewFiles = async () => {
    // Implementation for creating new file objects
    console.log('Creating new files...');
    setFilesLoaded(true);
  };

  const loadExistingFiles = async () => {
    // Implementation for loading existing file objects
    console.log('Loading existing files...');
    setFilesLoaded(true);
  };

  const getJobDisplayName = () => {
    if (!jobData) return 'Job Details';
    
    const parts = [];
    if (jobData.app_name) parts.push(jobData.app_name);
    if (jobData.release_name) parts.push(jobData.release_name);
    
    return parts.length > 0 ? parts.join(' - ') : 'Job Details';
  };

  const getStatusColor = (status: string) => {
    const lowerStatus = status.toLowerCase();
    
    if (lowerStatus.includes('succeed') || lowerStatus.includes('completed')) return '#10b981';
    if (lowerStatus.includes('fail') || lowerStatus.includes('error')) return '#ef4444';
    if (lowerStatus.includes('progress') || lowerStatus.includes('running') || 
        lowerStatus.includes('processing') || lowerStatus.includes('started')) return '#f59e0b';
    
    return '#3b82f6';
  };

  const goBack = () => {
    router.push('/jobs');
  };

  const goToPreview = () => {
    if (jobData?.job_id) {
      router.push(`/job/preview?jobId=${jobData.job_id}`);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <NavBar title="Job Details" />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spinner />
            <p style={{ marginTop: '20px', color: '#666' }}>Loading job details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <NavBar title="Job Details" />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <h2 style={{ color: '#ef4444', marginBottom: '20px' }}>Error Loading Job</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>{error}</p>
            <button 
              onClick={loadJobDetails}
              style={{
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                marginRight: '10px'
              }}
            >
              Retry
            </button>
            <button 
              onClick={goBack}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Back to Jobs
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!jobData) {
    return (
      <div className={styles.container}>
        <NavBar title="Job Details" />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ color: '#666' }}>Job not found</p>
            <button onClick={goBack}>Back to Jobs</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <NavBar title="Job Details" />
      <div className={styles.content}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <h1 style={{ margin: 0, marginBottom: '8px', color: '#1f2937' }}>
                {getJobDisplayName()}
              </h1>
              <p style={{ margin: 0, color: '#6b7280' }}>
                Job ID: {jobData.job_id}
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={goBack}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                ← Back to Jobs
              </button>
              
              {jobData.job_status?.toLowerCase().includes('digital assets') && (
                <button 
                  onClick={goToPreview}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Preview Assets
                </button>
              )}
            </div>
          </div>

          {/* Status */}
          <div 
            style={{
              display: 'inline-block',
              padding: '6px 12px',
              borderRadius: '16px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: getStatusColor(jobData.job_status || '') + '20',
              color: getStatusColor(jobData.job_status || '')
            }}
          >
            {jobData.job_status || 'Unknown'}
          </div>
        </div>

        {/* Job Info */}
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '24px',
          marginBottom: '24px'
        }}>
          <h2 style={{ margin: 0, marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>
            Job Information
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            <div>
              <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '500', color: '#4b5563' }}>App Name</p>
              <p style={{ margin: 0, fontSize: '16px' }}>{jobData.app_name}</p>
            </div>
            
            <div>
              <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '500', color: '#4b5563' }}>Release Name</p>
              <p style={{ margin: 0, fontSize: '16px' }}>{jobData.release_name}</p>
            </div>
            
            <div>
              <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '500', color: '#4b5563' }}>Source Folder</p>
              <p style={{ margin: 0, fontSize: '16px', fontFamily: 'monospace' }}>{jobData.source_folder}</p>
            </div>
            
            {jobData.created_at && (
              <div>
                <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '500', color: '#4b5563' }}>Created</p>
                <p style={{ margin: 0, fontSize: '16px' }}>
                  {new Date(jobData.created_at).toLocaleDateString()} {new Date(jobData.created_at).toLocaleTimeString()}
                </p>
              </div>
            )}
            
            {jobData.last_updated && (
              <div>
                <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '500', color: '#4b5563' }}>Last Updated</p>
                <p style={{ margin: 0, fontSize: '16px' }}>
                  {new Date(jobData.last_updated).toLocaleDateString()} {new Date(jobData.last_updated).toLocaleTimeString()}
                </p>
              </div>
            )}
            
            {jobData.api_files && (
              <div>
                <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '500', color: '#4b5563' }}>Files</p>
                <p style={{ margin: 0, fontSize: '16px' }}>{jobData.api_files.length}</p>
              </div>
            )}
          </div>
          
          {jobData.description && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '500', color: '#4b5563' }}>Description</p>
              <p style={{ margin: 0, fontSize: '16px' }}>{jobData.description}</p>
            </div>
          )}
        </div>

        {/* Progress */}
        {(jobData.progress_percentage !== undefined || jobData.current_step) && (
          <div style={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '24px'
          }}>
            <h2 style={{ margin: 0, marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>
              Progress
            </h2>
            
            {jobData.progress_percentage !== undefined && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', color: '#4b5563' }}>Overall Progress</span>
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>{jobData.progress_percentage}%</span>
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: '#e5e7eb',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${jobData.progress_percentage}%`,
                    height: '100%',
                    backgroundColor: '#3b82f6',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
            )}
            
            {jobData.current_step && (
              <p style={{ margin: 0, fontSize: '14px', color: '#4b5563' }}>
                Current Step: <span style={{ fontWeight: '500', color: '#1f2937' }}>{jobData.current_step}</span>
              </p>
            )}
          </div>
        )}

        {/* Files */}
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '24px'
        }}>
          <h2 style={{ margin: 0, marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>
            Files ({jobData.api_files?.length || 0})
          </h2>
          
          {jobData.api_files && jobData.api_files.length > 0 ? (
            <div style={{ display: 'grid', gap: '8px' }}>
              {jobData.api_files.map((filename, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px'
                  }}
                >
                  <span style={{ fontSize: '16px', marginRight: '8px' }}>📄</span>
                  <span style={{ fontSize: '14px', fontFamily: 'monospace', flex: 1 }}>{filename}</span>
                  {uploadingFiles.has(filename) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '100px',
                        height: '4px',
                        backgroundColor: '#e5e7eb',
                        borderRadius: '2px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${uploadProgress[filename] || 0}%`,
                          height: '100%',
                          backgroundColor: '#3b82f6',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                      <span style={{ fontSize: '12px', color: '#4b5563' }}>
                        {uploadProgress[filename] || 0}%
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No files found for this job.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JobDetailsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <JobDetailsContent />
    </Suspense>
  );
} 