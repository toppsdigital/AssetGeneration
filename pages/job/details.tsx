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
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    currentFile: string;
  } | null>(null);
  const [filesCreated, setFilesCreated] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);

  useEffect(() => {
    if (jobId) {
      loadJobDetails();
    }
  }, [jobId]);

  // Create file objects after job details are loaded
  useEffect(() => {
    if (jobData && jobData.api_files && jobData.api_files.length > 0 && !filesCreated) {
      createFileObjects();
    }
  }, [jobData, filesCreated]);

  // Start upload process if coming from new job creation
  useEffect(() => {
    if (startUpload === 'true' && jobData && (jobData.job_status === 'Upload in progress' || jobData.job_status === 'Upload started')) {
      startUploadProcess();
    }
  }, [startUpload, jobData]);

  // Monitor file status changes to update job status automatically
  useEffect(() => {
    if (jobData?.content_pipeline_files && jobData.content_pipeline_files.length > 0) {
      const { uploadedPdfCount, totalPdfCount } = getUploadProgress();
      
      // Auto-update job status when all files are uploaded
      if (uploadedPdfCount === totalPdfCount && totalPdfCount > 0 && jobData.job_status !== 'Upload completed') {
        console.log('All PDFs uploaded, updating job status to completed');
        updateJobStatus('Upload completed', 100, 'All files uploaded successfully');
      }
    }
  }, [jobData?.content_pipeline_files, forceUpdate]);

  const loadJobDetails = async () => {
    try {
      setLoading(true);
      
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

  // Create file objects using batch create
  const createFileObjects = async () => {
    if (!jobData || !jobData.api_files || jobData.api_files.length === 0) return;
    
    try {
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
      setFilesCreated(true);
      
    } catch (error) {
      console.error('Error creating file objects:', error);
      setError('Failed to create file objects: ' + (error as Error).message);
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

  // Update individual PDF file status in Content Pipeline API
  const updateFileStatusInAPI = async (pdfFilename: string, status: 'Uploading' | 'Uploaded' | 'Failed') => {
    if (!jobData?.content_pipeline_files) return;
    
    try {
      // Find which file object this PDF belongs to
      const fileObj = jobData.content_pipeline_files.find(f => 
        f.original_files && Object.keys(f.original_files).includes(pdfFilename)
      );
      
      if (!fileObj) {
        console.warn(`Could not find file object for PDF: ${pdfFilename}`);
        return;
      }
      
      // Update the file in the API
      const updates = {
        status: status,
        metadata: {
          job_id: jobData.job_id,
          original_files: {
            ...fileObj.original_files,
            [pdfFilename]: {
              ...fileObj.original_files![pdfFilename],
              status: status
            }
          }
        }
      };
      
      await contentPipelineApi.updateFile(fileObj.filename, updates);
      
      // Update local state
      const updatedFiles = jobData.content_pipeline_files.map(f => {
        if (f.filename === fileObj.filename && f.original_files) {
          return {
            ...f,
            original_files: {
              ...f.original_files,
              [pdfFilename]: {
                ...f.original_files[pdfFilename],
                status: status
              }
            },
            last_updated: new Date().toISOString()
          };
        }
        return f;
      });
      
      setJobData({
        ...jobData,
        content_pipeline_files: updatedFiles
      });
      
      // Force a re-render to update progress indicators
      setForceUpdate(prev => prev + 1);
      
      console.log(`Updated ${pdfFilename} status to ${status} for file ${fileObj.filename}`);
      
    } catch (error) {
      console.error(`Error updating file status for ${pdfFilename}:`, error);
    }
  };

  // Upload files to S3 using existing infrastructure
  const uploadFilesToS3 = async (jobData: JobData, selectedFiles: File[]): Promise<void> => {
    if (!selectedFiles || selectedFiles.length === 0) {
      throw new Error('No files selected for upload');
    }

    console.log(`Starting upload of ${selectedFiles.length} files for job:`, jobData.job_id);

    setUploadProgress({ current: 0, total: selectedFiles.length, currentFile: '' });

    // Update job status to show upload in progress
    await updateJobStatus('Upload in progress', 0, 'Starting file upload');

    // Adaptive delay - starts at 0.5 seconds, increases by 1 second if rate limited
    let currentDelay = 500; // Start with 0.5 seconds

    // Upload each file to S3
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      // Update progress to show current file being uploaded
      setUploadProgress({ current: i, total: selectedFiles.length, currentFile: file.name });
      
      // File is now being uploaded - status tracked in Content Pipeline files
      
      // Update job progress
      const progressPercentage = Math.round((i / selectedFiles.length) * 100);
      await updateJobStatus('Upload in progress', progressPercentage, `Uploading ${file.name}`);
      
      try {
        // Generate S3 path - using the same pattern as job JSON uploads
        const s3Path = `${jobData.app_name}/PDFs/${file.name}`;
        console.log(`Uploading ${file.name} to S3 path: ${s3Path}`);
        
        // Get presigned URL for file upload - EXACTLY like job JSON upload
        const presignedResponse = await fetch('/api/s3-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            client_method: 'put',
            filename: s3Path,
            upload: true
          }),
        });

        if (!presignedResponse.ok) {
          throw new Error(`Failed to get presigned URL for ${file.name}`);
        }

        const { presignedUrl } = await presignedResponse.json();
        console.log(`Got presigned URL for ${file.name}`);
        
        // Upload file to S3 - EXACTLY like job JSON upload
        const formData = new FormData();
        formData.append('file', file, file.name);
        formData.append('presignedUrl', presignedUrl);

        console.log(`Uploading ${file.name} using s3-upload API...`);
        
        // Retry logic with exponential backoff for S3 rate limiting
        let uploadResponse;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount <= maxRetries) {
          try {
            uploadResponse = await fetch('/api/s3-upload', {
              method: 'POST',
              body: formData,
            });

            // If successful or not a rate limit error, break out of retry loop
            if (uploadResponse.ok || (uploadResponse.status !== 503 && uploadResponse.status !== 429)) {
              break;
            }

            // If it's a rate limit error (503 or 429), retry with exponential backoff
            if (uploadResponse.status === 503 || uploadResponse.status === 429) {
              retryCount++;
              if (retryCount <= maxRetries) {
                const backoffDelay = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
                console.warn(`Rate limit hit for ${file.name}, retrying in ${backoffDelay}ms (attempt ${retryCount}/${maxRetries})`);
                
                // Increase the delay for future uploads when rate limited
                currentDelay += 1000; // Add 1 second to delay
                console.log(`Increasing delay for future uploads to ${currentDelay}ms due to rate limiting`);
                
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
                continue;
              }
            }
          } catch (fetchError) {
            console.error(`Network error uploading ${file.name}:`, fetchError);
            throw fetchError;
          }
        }

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error(`Upload failed for ${file.name} after ${retryCount} retries:`, uploadResponse.status, errorText);
          throw new Error(`Failed to upload ${file.name} to S3: ${uploadResponse.status} ${errorText}`);
        }

        const uploadResult = await uploadResponse.json();
        console.log(`Successfully uploaded ${file.name} to ${s3Path}`, uploadResult);
        
        // Update file status in Content Pipeline API
        await updateFileStatusInAPI(file.name, 'Uploaded');
        
        // Adaptive delay between uploads - starts at 0.5s, increases if rate limited
        console.log(`Waiting ${currentDelay}ms before next upload...`);
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        
        // Update progress to show this file is completed
        setUploadProgress({ current: i + 1, total: selectedFiles.length, currentFile: file.name });
        
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        
        // Update file status to failed in Content Pipeline API
        await updateFileStatusInAPI(file.name, 'Failed');
        
        // Add delay even on failure to prevent rapid retry attempts
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Still increment progress even on failure
        setUploadProgress({ current: i + 1, total: selectedFiles.length, currentFile: file.name });
        
        throw error;
      }
    }

    // Final completion state
    setUploadProgress({ current: selectedFiles.length, total: selectedFiles.length, currentFile: 'Complete!' });
    console.log('All files uploaded successfully!');
  };

  // Handle file selection and start upload process
  const handleFileUpload = async () => {
    if (!jobData) return;

    // Create file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = '.pdf';
    
    fileInput.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      
      const selectedFiles = Array.from(files);
      console.log(`Selected ${selectedFiles.length} files for upload`);
      
      try {
        // Upload all selected files
        await uploadFilesToS3(jobData, selectedFiles);
        
        // Clear upload progress to show file details section
        setUploadProgress(null);
        
        // Job status will be automatically updated by the useEffect monitoring file statuses
        
        console.log('Upload process completed successfully');
        
      } catch (error) {
        console.error('Error during upload process:', error);
        setError('Upload failed: ' + (error as Error).message);
        
        // Update job status to failed
        await updateJobStatus('Upload failed', undefined, 'Upload process failed');
      }
    };
    
    fileInput.click();
  };

  // Start the upload process (for compatibility with existing code)
  const startUploadProcess = async () => {
    if (!jobData) return;

    // Check if files were passed from the new job page
    const uploadSessionData = sessionStorage.getItem(`upload_${jobData.job_id}`);
    const pendingFiles = (window as any).pendingUploadFiles;
    
    console.log('Auto-upload check:', {
      hasSessionData: !!uploadSessionData,
      hasPendingFiles: !!pendingFiles,
      jobIdMatch: pendingFiles?.jobId === jobData.job_id
    });

    if (uploadSessionData && pendingFiles && pendingFiles.jobId === jobData.job_id) {
      console.log('Files available from new job page, starting automatic upload...');
      const actualFiles = pendingFiles.files || [];
      
      if (actualFiles.length > 0) {
        try {
          // Upload all files that were selected on the new job page
          await uploadFilesToS3(jobData, actualFiles);
          
          // Clear upload progress to show file details section
          setUploadProgress(null);
          
          // Job status will be automatically updated by the useEffect monitoring file statuses
          
          // Clean up stored data
          sessionStorage.removeItem(`upload_${jobData.job_id}`);
          delete (window as any).pendingUploadFiles;
          
          console.log('Automatic upload completed successfully');
          
        } catch (error) {
          console.error('Error during automatic upload:', error);
          setError('Upload failed: ' + (error as Error).message);
          
          // Update job status to failed
          await updateJobStatus('Upload failed', undefined, 'Upload process failed');
        }
      }
    } else {
      console.log('No files available from new job page. User needs to select files manually.');
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

  // Calculate upload progress from file statuses
  const getUploadProgress = () => {
    if (!jobData?.content_pipeline_files || jobData.content_pipeline_files.length === 0) {
      return { uploadedPdfCount: 0, totalPdfCount: 0, progressPercentage: 0 };
    }
    
    let uploadedPdfCount = 0;
    let totalPdfCount = 0;
    
    jobData.content_pipeline_files.forEach(file => {
      if (file.original_files) {
        Object.values(file.original_files).forEach(pdf => {
          totalPdfCount++;
          if (pdf.status === 'Uploaded') {
            uploadedPdfCount++;
          }
        });
      }
    });
    
    const progressPercentage = totalPdfCount > 0 ? (uploadedPdfCount / totalPdfCount) * 100 : 0;
    return { uploadedPdfCount, totalPdfCount, progressPercentage };
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

                        {/* Upload Section - Show only when files are being uploaded */}
            {(() => {
              const { uploadedPdfCount, totalPdfCount } = getUploadProgress();
              // Show upload section when there are files to upload but not all are uploaded yet
              return (totalPdfCount > 0 && uploadedPdfCount < totalPdfCount);
            })() && (
              <div style={{ 
                marginBottom: 32,
                padding: 24,
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 16
              }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: 20
                }}>
                  <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: 600,
                    color: '#f8f8f8',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    📤 Uploading Files
                  </h2>
                  
                  {/* Upload Button - Show when no upload is in progress and no files from new job page */}
                  {!uploadProgress && !sessionStorage.getItem(`upload_${jobData.job_id}`) && (
                    <button
                      onClick={handleFileUpload}
                      style={{
                        background: 'rgba(16, 185, 129, 0.2)',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        borderRadius: 8,
                        color: '#34d399',
                        cursor: 'pointer',
                        fontSize: 14,
                        padding: '8px 16px',
                        fontWeight: 500,
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(16, 185, 129, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)';
                      }}
                    >
                      📁 Select PDF Files
                    </button>
                  )}
                </div>
                
                {/* Progress Bar based on Individual PDF Files */}
                {jobData.content_pipeline_files && jobData.content_pipeline_files.length > 0 && (
                  <>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      marginBottom: 12
                    }}>
                      <div style={{
                        flex: 1,
                        height: 12,
                        background: 'rgba(59, 130, 246, 0.2)',
                        borderRadius: 6,
                        overflow: 'hidden',
                        position: 'relative'
                      }}>
                        {(() => {
                          const { progressPercentage } = getUploadProgress();
                          
                          return (
                            <div style={{
                              width: `${progressPercentage}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                              borderRadius: 6,
                              transition: 'width 0.3s ease'
                            }} />
                          );
                        })()}
                      </div>
                      
                      {/* PDF Count Indicator */}
                      <div style={{
                        color: '#60a5fa',
                        fontSize: 16,
                        fontWeight: 600,
                        minWidth: '80px',
                        textAlign: 'right',
                        fontFamily: 'monospace'
                      }}>
                        {(() => {
                          const { uploadedPdfCount, totalPdfCount } = getUploadProgress();
                          return `${uploadedPdfCount} / ${totalPdfCount}`;
                        })()}
                      </div>
                    </div>
                    
                    {/* Current Status */}
                    <div style={{ 
                      color: '#9ca3af', 
                      fontSize: 14,
                      fontStyle: 'italic',
                      marginBottom: 16
                    }}>
                      {(() => {
                        const { uploadedPdfCount, totalPdfCount } = getUploadProgress();
                        
                        if (uploadedPdfCount === totalPdfCount && totalPdfCount > 0) {
                          return '✅ All PDF files uploaded successfully!';
                        } else if (uploadedPdfCount > 0) {
                          return `📤 Uploading PDF files... (${uploadedPdfCount} of ${totalPdfCount} completed)`;
                        } else {
                          return '⏳ Preparing PDF files for upload...';
                        }
                      })()}
                    </div>
                  </>
                )}
                
                {/* Show message when no files are created yet */}
                {(!jobData.content_pipeline_files || jobData.content_pipeline_files.length === 0) && (
                  <div style={{ 
                    color: '#9ca3af', 
                    fontSize: 14,
                    fontStyle: 'italic',
                    marginBottom: 16
                  }}>
                    {jobData.job_status === 'Upload in progress' 
                      ? '⏳ Preparing file objects...' 
                      : 'Click "Select PDF Files" to choose files for upload'
                    }
                  </div>
                )}
              </div>
            )}

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
                
                {jobData.content_pipeline_files && jobData.content_pipeline_files.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {jobData.content_pipeline_files.map((file, index) => (
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
                  ))}
                  </div>
                ) : (
                  <div style={{
                    textAlign: 'center',
                    padding: '48px 0',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
                    <h3 style={{ color: '#9ca3af', fontSize: 18, marginBottom: 8 }}>No Files Found</h3>
                    <p style={{ color: '#6b7280', fontSize: 14 }}>
                      This job doesn't have any file details yet.
                    </p>
                  </div>
                )}
              </div>

          </div>
        </main>
      </div>
    </div>
  );
} 