import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import styles from '../../styles/Edit.module.css';
import NavBar from '../../components/NavBar';
import Spinner from '../../components/Spinner';

interface UploadResult {
  success: boolean;
  jobId: string;
  message: string;
  folderPath: string;
  processId: number;
  metadata: {
    template: string | null;
    layerEdits: any;
  };
}

export default function ExtractionProcessingPage() {
  const router = useRouter();
  const { psdfile, uploadResult } = router.query;
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [processingStatus, setProcessingStatus] = useState<string>('Starting PDF upload...');
  const [jobFiles, setJobFiles] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [mostRecentJob, setMostRecentJob] = useState<any>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionCompleted, setExtractionCompleted] = useState(false);
  const [isCreatingAssets, setIsCreatingAssets] = useState(false);
  const [assetsCompleted, setAssetsCompleted] = useState(false);

  useEffect(() => {
    if (uploadResult) {
      try {
        const parsedResult = JSON.parse(uploadResult as string);
        setResult(parsedResult);
        
        if (parsedResult.success) {
          // Start monitoring the process
          monitorProcessing(parsedResult.processId);
        } else {
          setIsProcessing(false);
        }
      } catch (err) {
        setError('Failed to parse upload result');
        setIsProcessing(false);
        console.error('Error parsing upload result:', err);
      }
    }
  }, [uploadResult]);

  // Fetch and download the most recent job file details
  const fetchJobFiles = async () => {
    setLoadingJobs(true);
    try {
      // 1. Get list of job files
      const listRes = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_method: 'list' }),
      });
      if (!listRes.ok) throw new Error('Failed to fetch job files');
      const listData = await listRes.json();
      
      console.log('Raw S3 API response:', listData);
      
      // Filter for files in uploads/Jobs/ directory and pick the first one
      const jobFiles = listData.files.filter((file: string) => {
        const isInJobsDir = file.startsWith('asset_generator/dev/uploads/Jobs/');
        return isInJobsDir;
      });
      
      console.log('Job files found:', jobFiles);
      setJobFiles(jobFiles.map(file => ({ name: file })));
      
      if (jobFiles.length > 0) {
        const firstJobFile = jobFiles[0];
        console.log('Selected first job file:', firstJobFile);
        
        // 2. Download the JSON file directly (same pattern as index.tsx)
        // Extract just the relative path from Jobs/ onwards
        const relativePath = firstJobFile.replace('asset_generator/dev/uploads/', '');
        const downloadRes = await fetch('/api/s3-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            client_method: 'get', 
            filename: relativePath,
            download: true 
          }),
        });
        
        if (!downloadRes.ok) throw new Error('Failed to download job file');
        const jobData = await downloadRes.json();
        
        console.log('Job data updated:', jobData);
        setMostRecentJob(jobData);
        setJobStatus(jobData.job_status || 'Status unknown');
        
        // Check if extraction is already completed and update state accordingly
        if (jobData.job_status && jobData.job_status.toLowerCase().includes('extraction completed')) {
          setExtractionCompleted(true);
        }
        
        // Check if digital assets are already completed and update state accordingly
        if (jobData.job_status && (
          jobData.job_status.toLowerCase().includes('digital assets completed') ||
          jobData.job_status.toLowerCase().includes('digital assets succeeded')
        )) {
          setAssetsCompleted(true);
        }
        
        // Log the updated status for debugging
        console.log('Updated job status:', jobData.job_status);
      }
    } catch (err) {
      console.error('Error fetching job details:', err);
      setJobStatus('Failed to load job status');
    } finally {
      setLoadingJobs(false);
    }
  };

  const monitorProcessing = (processId: number) => {
    let statusMessages = [
      'Scanning PDF folder...',
      'Uploading PDFs to S3...',
      'Processing job tracking...',
      'Finalizing upload...'
    ];
    let messageIndex = 0;

    // Update status messages every 2 seconds
    const statusInterval = setInterval(() => {
      if (messageIndex < statusMessages.length - 1) {
        messageIndex++;
        setProcessingStatus(statusMessages[messageIndex]);
      }
    }, 2000);

    // Simulate processing time (since we can't easily check if python process is done)
    // In a real app, you'd poll an API endpoint to check process status
    setTimeout(() => {
      clearInterval(statusInterval);
      setProcessingStatus('Upload complete!');
      setTimeout(async () => {
        setIsProcessing(false);
        // Fetch job files when processing is complete
        await fetchJobFiles();
      }, 1000);
    }, 8000); // 8 seconds total processing time
  };

  const startPdfExtraction = async () => {
    if (!jobFiles[0]?.name) {
      alert('No job file found to extract');
      return;
    }

    setIsExtracting(true);
    try {
      // Extract the relative path from the full S3 path
      const jobFilePath = jobFiles[0].name.replace('asset_generator/dev/uploads/', '');
      
      const response = await fetch('/api/extract-pdfs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobFilePath }),
      });

      if (!response.ok) {
        throw new Error('Failed to start PDF extraction');
      }

      const result = await response.json();
      console.log('Extraction started:', result);

      // Simulate extraction process monitoring
      let extractionStatusMessages = [
        'Starting PDF extraction...',
        'Analyzing PDF layers...',
        'Extracting assets...',
        'Processing layers...',
        'Finalizing extraction...'
      ];
      let messageIndex = 0;
      setProcessingStatus(extractionStatusMessages[messageIndex]);

      const statusInterval = setInterval(() => {
        if (messageIndex < extractionStatusMessages.length - 1) {
          messageIndex++;
          setProcessingStatus(extractionStatusMessages[messageIndex]);
        }
      }, 3000);

      // Simulate extraction completion after 15 seconds
      setTimeout(() => {
        clearInterval(statusInterval);
        setProcessingStatus('Extraction complete!');
        setTimeout(async () => {
          setIsExtracting(false);
          setExtractionCompleted(true);
          // Wait additional time for the Python script to upload updated job file to S3
          console.log('Waiting for job file to be updated in S3...');
          setTimeout(async () => {
            // Refresh job status to see updated status
            await fetchJobFiles();
          }, 2000); // Additional 2-second delay for S3 upload and consistency
        }, 1000);
      }, 15000);

    } catch (error) {
      console.error('Error starting extraction:', error);
      alert('Failed to start PDF extraction: ' + (error as Error).message);
      setIsExtracting(false);
    }
  };

  const createDigitalAssets = async () => {
    if (!jobFiles[0]?.name) {
      alert('No job file found to create assets');
      return;
    }

    setIsCreatingAssets(true);
    try {
      // Extract the relative path from the full S3 path
      const jobFilePath = jobFiles[0].name.replace('asset_generator/dev/uploads/', '');
      
      const response = await fetch('/api/create-digital-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobFilePath }),
      });

      if (!response.ok) {
        throw new Error('Failed to start digital asset creation');
      }

      const result = await response.json();
      console.log('Asset creation started:', result);

      // Simulate asset creation process monitoring
      let assetCreationStatusMessages = [
        'Starting digital asset creation...',
        'Connecting to Adobe Firefly API...',
        'Processing extracted layers...',
        'Generating digital assets...',
        'Uploading generated assets...',
        'Finalizing asset creation...'
      ];
      let messageIndex = 0;
      setProcessingStatus(assetCreationStatusMessages[messageIndex]);

      const statusInterval = setInterval(() => {
        if (messageIndex < assetCreationStatusMessages.length - 1) {
          messageIndex++;
          setProcessingStatus(assetCreationStatusMessages[messageIndex]);
        }
      }, 4000);

      // Simulate asset creation completion after 24 seconds
      setTimeout(() => {
        clearInterval(statusInterval);
        setProcessingStatus('Digital asset creation complete!');
        setTimeout(async () => {
          setIsCreatingAssets(false);
          setAssetsCompleted(true);
          // Wait additional time for the Python script to upload updated job file to S3
          console.log('Waiting for job file to be updated in S3...');
          setTimeout(async () => {
            // Refresh job status to see updated status
            await fetchJobFiles();
          }, 2000); // Additional 2-second delay for S3 upload and consistency
        }, 1000);
      }, 24000);

    } catch (error) {
      console.error('Error starting asset creation:', error);
      alert('Failed to start digital asset creation: ' + (error as Error).message);
      setIsCreatingAssets(false);
    }
  };

  const previewAssets = async () => {
    if (!jobFiles[0]?.name || !mostRecentJob) {
      alert('No job file found to preview assets');
      return;
    }

    try {
      console.log('Preview assets for job:', mostRecentJob);
      
      // Navigate to the preview assets page with job data
      const psdfile = router.query.psdfile;
      const jobDataString = JSON.stringify(mostRecentJob);
      
      router.push({
        pathname: `/${psdfile}/preview-assets`,
        query: {
          jobData: jobDataString
        }
      });
      
    } catch (error) {
      console.error('Error navigating to preview assets:', error);
      alert('Failed to preview assets: ' + (error as Error).message);
    }
  };

  const displayName = Array.isArray(psdfile) ? psdfile[0] : psdfile;

  if (error) {
    return (
      <div className={styles.pageContainer}>
        <NavBar
          showHome
          onHome={() => router.push('/')}
          title={assetsCompleted ? "Digital Assets Created Successfully" :
                 extractionCompleted ? "PDF Extraction completed successfully" : "Extraction Processing"}
        />
        <div className={styles.loading}>
          <h2>❌ Error</h2>
          <p>{error}</p>
          <button 
            onClick={() => router.push('/')}
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
            Return Home
          </button>
        </div>
      </div>
    );
  }

  if (!result || isProcessing || isExtracting || isCreatingAssets) {
    return (
      <div className={styles.pageContainer}>
        <NavBar
          showHome
          onHome={() => router.push('/')}
          title={isCreatingAssets ? "Creating Digital Assets" : 
                 isExtracting ? "Processing PDF Extraction" : "Processing Upload"}
        />
        <div className={styles.editContainer}>
          <main className={styles.mainContent}>
            <div style={{
              maxWidth: 600,
              width: '100%',
              background: 'rgba(255, 255, 255, 0.06)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 16,
              padding: 48,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: 60,
                marginBottom: 24,
                animation: 'pulse 1.5s infinite'
              }}>
                🔄
              </div>
              
              <h2 style={{
                fontSize: '2rem',
                fontWeight: 600,
                color: '#3b82f6',
                marginBottom: 16
              }}>
                Processing Upload
              </h2>
              
              <Spinner />
              
              <p style={{
                fontSize: 18,
                color: '#e0e0e0',
                marginTop: 24,
                marginBottom: 32,
                lineHeight: 1.5
              }}>
                {processingStatus}
              </p>

              <div style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 12,
                padding: 20,
                fontSize: 14,
                color: '#93c5fd'
              }}>
                💡 Please wait while we upload your PDFs to S3. This may take a few moments depending on the number of files.
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <NavBar
        showHome
        onHome={() => router.push('/')}
        title={`Processing: ${displayName || 'Template'}`}
      />
      
      <div className={styles.editContainer}>
        <main className={styles.mainContent}>
          <div style={{
            maxWidth: 900,
            width: '100%',
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            textAlign: 'center'
          }}>
            {result.success ? (
              <>
                <h2 style={{
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  color: '#10b981',
                  marginBottom: 24
                }}>
                  {assetsCompleted ? '🚀 Digital Assets Created Successfully' : 
                   extractionCompleted ? '🎉 PDF Extraction Completed Successfully' : '✅ PDF Upload Completed Successfully'}
                </h2>

                <div style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 20,
                  textAlign: 'left'
                }}>
                  <h3 style={{
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    marginBottom: 12,
                    color: '#f8f8f8'
                  }}>
                    Processing Details
                  </h3>
                  
                  <div style={{ marginBottom: 12 }}>
                    <strong>Source Folder:</strong> <code style={{ 
                      background: 'rgba(255, 255, 255, 0.1)', 
                      padding: '4px 8px', 
                      borderRadius: 4,
                      fontSize: 12,
                      wordBreak: 'break-all',
                      marginLeft: 8
                    }}>{result.folderPath}</code>
                  </div>
                  
                  {result.metadata.template && (
                    <div style={{ marginBottom: 12 }}>
                      <strong>Template:</strong> <code style={{ 
                        background: 'rgba(255, 255, 255, 0.1)', 
                        padding: '2px 8px', 
                        borderRadius: 4,
                        fontSize: 14
                      }}>{result.metadata.template}</code>
                    </div>
                  )}
                </div>

                {/* Most Recent Job Status - EMPHASIZED */}
                <div style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '2px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: 16,
                  padding: 24,
                  marginBottom: 20,
                  textAlign: 'left',
                  boxShadow: '0 4px 20px rgba(59, 130, 246, 0.15)'
                }}>
                  <h3 style={{
                    fontSize: '1.4rem',
                    fontWeight: 700,
                    marginBottom: 20,
                    color: '#60a5fa',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    📊 Most Recent Job
                  </h3>
                  
                  {loadingJobs ? (
                    <div style={{ textAlign: 'center', padding: 16 }}>
                      <Spinner />
                      <p style={{ marginTop: 8, color: '#e0e0e0' }}>Loading job details...</p>
                    </div>
                  ) : mostRecentJob ? (
                    <div style={{
                      border: '1px solid rgba(59, 130, 246, 0.2)',
                      borderRadius: 12,
                      background: 'rgba(0, 0, 0, 0.3)',
                      padding: 20
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 16,
                        marginBottom: 16
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: 12,
                            color: '#9ca3af',
                            marginBottom: 4
                          }}>
                            {jobFiles[0]?.name?.split('/').pop() || 'Unknown File'}
                          </div>
                          <div style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: '#f8f8f8',
                            marginBottom: 8
                          }}>
                            Job Status
                          </div>
                          <div style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: jobStatus?.toLowerCase().includes('succeed') ? '#10b981' : 
                                  jobStatus?.toLowerCase().includes('fail') ? '#ef4444' : 
                                  jobStatus?.toLowerCase().includes('running') ? '#3b82f6' : '#9ca3af',
                            marginBottom: 4
                          }}>
                            {jobStatus || 'Unknown Status'}
                          </div>
                          {(mostRecentJob.last_updated || jobFiles[0]?.lastModified) && (
                            <div style={{
                              fontSize: 12,
                              color: '#9ca3af'
                            }}>
                              Last updated: {new Date(mostRecentJob.last_updated || jobFiles[0]?.lastModified).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                              })}
                            </div>
                          )}
                        </div>
                        
                        <button
                          onClick={() => {
                            const status = jobStatus?.toLowerCase() || '';
                            if (status.includes('upload completed')) {
                              startPdfExtraction();
                            } else if (status.includes('extraction completed')) {
                              createDigitalAssets();
                            } else if (status.includes('digital assets completed') || status.includes('digital assets succeeded')) {
                              previewAssets();
                            } else {
                              // Handle other statuses
                              console.log('Next action for status:', jobStatus, mostRecentJob);
                              // TODO: Implement other next actions
                            }
                          }}
                          disabled={isExtracting || isCreatingAssets}
                          style={{
                            padding: '8px 20px',
                            fontSize: 14,
                            fontWeight: 600,
                            background: (isExtracting || isCreatingAssets)
                              ? 'rgba(107, 114, 128, 0.5)' 
                              : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            cursor: (isExtracting || isCreatingAssets) ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            flexShrink: 0,
                            opacity: (isExtracting || isCreatingAssets) ? 0.6 : 1
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          {(() => {
                            const status = jobStatus?.toLowerCase() || '';
                            if (status.includes('upload completed')) return 'Start PDF Extraction';
                            if (status.includes('extraction completed')) return 'Create Digital Assets';
                            if (status.includes('digital assets completed') || status.includes('digital assets succeeded')) return 'Preview Assets';
                            return 'Next';
                          })()}
                        </button>
                      </div>
                      
                      {/* Additional job details */}
                      {mostRecentJob.job_id && (
                        <div style={{
                          marginTop: 12,
                          padding: 12,
                          background: 'rgba(255, 255, 255, 0.05)',
                          borderRadius: 8,
                          fontSize: 12
                        }}>
                          <strong>Job ID:</strong> <code style={{ 
                            marginLeft: 8,
                            background: 'rgba(255, 255, 255, 0.1)', 
                            padding: '2px 6px', 
                            borderRadius: 4 
                          }}>{mostRecentJob.job_id}</code>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p style={{ 
                      color: '#9ca3af', 
                      fontStyle: 'italic',
                      textAlign: 'center',
                      padding: 16
                    }}>
                      No job files found in uploads/Jobs/
                    </p>
                  )}
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginTop: 16
                }}>
                  <button
                    onClick={() => router.back()}
                    style={{
                      padding: '10px 20px',
                      fontSize: 14,
                      fontWeight: 600,
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: 'white',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: 8,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    ⬅️ Go Back
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  fontSize: 48,
                  marginBottom: 16
                }}>
                  ❌
                </div>
                
                <h2 style={{
                  fontSize: '2rem',
                  fontWeight: 600,
                  color: '#ef4444',
                  marginBottom: 16
                }}>
                  Upload Failed
                </h2>
                
                <p style={{
                  fontSize: 18,
                  color: '#e0e0e0',
                  marginBottom: 32
                }}>
                  There was an issue with the PDF upload process.
                </p>

                <button
                  onClick={() => router.back()}
                  style={{
                    padding: '12px 24px',
                    fontSize: 16,
                    fontWeight: 600,
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 12,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Try Again
                </button>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
} 