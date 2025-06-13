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
  const [jobFiles, setJobFiles] = useState<string[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

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

  // Fetch job files from uploads/jobs/ directory (referenced from index.tsx logic)
  const fetchJobFiles = async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_method: 'list' }),
      });
      if (!res.ok) throw new Error('Failed to fetch job files');
      const data = await res.json();
      
      // Filter for files in uploads/Jobs/ directory
      const jobFiles = data.files.filter((file: string) => {
        const isInJobsDir = file.startsWith('asset_generator/dev/uploads/Jobs/');
        return isInJobsDir;
      });
      
      // Sort by most recent first (assuming filename contains timestamp or is naturally sortable)
      jobFiles.sort((a: string, b: string) => b.localeCompare(a));
      
      setJobFiles(jobFiles);
    } catch (err) {
      console.error('Error fetching job files:', err);
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
      setTimeout(() => {
        setIsProcessing(false);
        // Fetch job files when processing is complete
        fetchJobFiles();
      }, 1000);
    }, 8000); // 8 seconds total processing time
  };

  const displayName = Array.isArray(psdfile) ? psdfile[0] : psdfile;

  if (error) {
    return (
      <div className={styles.pageContainer}>
        <NavBar
          showHome
          onHome={() => router.push('/')}
          title="Extraction Processing"
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

  if (!result || isProcessing) {
    return (
      <div className={styles.pageContainer}>
        <NavBar
          showHome
          onHome={() => router.push('/')}
          title="Processing Upload"
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
                  ✅ PDF Upload Completed Successfully
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

                {/* Job Files Section - EMPHASIZED */}
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
                    📊 Recent Jobs
                  </h3>
                  
                  {loadingJobs ? (
                    <div style={{ textAlign: 'center', padding: 16 }}>
                      <Spinner />
                      <p style={{ marginTop: 8, color: '#e0e0e0' }}>Loading job history...</p>
                    </div>
                  ) : jobFiles.length > 0 ? (
                    <div style={{
                      maxHeight: 300,
                      overflowY: 'auto',
                      border: '1px solid rgba(59, 130, 246, 0.2)',
                      borderRadius: 12,
                      background: 'rgba(0, 0, 0, 0.3)'
                    }}>
                                             {jobFiles.slice(0, 10).map((jobFile, index) => {
                         const fileName = jobFile.split('/').pop();
                         const isCurrentJob = fileName && result.jobId && fileName.includes(result.jobId);
                         
                         // Extract timestamp from filename (assuming format includes timestamp)
                         const getTimestampFromFilename = (filename: string) => {
                           console.log('Trying to extract timestamp from filename:', filename);
                           
                           // Try multiple timestamp patterns
                           const patterns = [
                             // Pattern 1: 2024-01-15_14-30-45 or 2024_01_15_14_30_45
                             /(\d{4}[-_]\d{2}[-_]\d{2}[-_]\d{2}[-_]\d{2}[-_]\d{2})/,
                             // Pattern 2: 20240115_143045 or 20240115143045
                             /(\d{14})/,
                             // Pattern 3: 2024-01-15T14:30:45 (ISO format)
                             /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/,
                             // Pattern 4: Unix timestamp (10 digits)
                             /(\d{10})/
                           ];
                           
                           for (const pattern of patterns) {
                             const match = filename.match(pattern);
                             if (match) {
                               console.log('Found timestamp match:', match[1]);
                               try {
                                 let dateStr = match[1];
                                 
                                 // Handle different formats
                                 if (pattern === patterns[0]) {
                                   // Format: 2024-01-15_14-30-45
                                   const timestamp = dateStr.replace(/[-_]/g, '');
                                   const year = timestamp.slice(0, 4);
                                   const month = timestamp.slice(4, 6);
                                   const day = timestamp.slice(6, 8);
                                   const hour = timestamp.slice(8, 10);
                                   const minute = timestamp.slice(10, 12);
                                   const second = timestamp.slice(12, 14);
                                   return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
                                 } else if (pattern === patterns[1]) {
                                   // Format: 20240115143045
                                   const year = dateStr.slice(0, 4);
                                   const month = dateStr.slice(4, 6);
                                   const day = dateStr.slice(6, 8);
                                   const hour = dateStr.slice(8, 10);
                                   const minute = dateStr.slice(10, 12);
                                   const second = dateStr.slice(12, 14);
                                   return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
                                 } else if (pattern === patterns[2]) {
                                   // Format: 2024-01-15T14:30:45
                                   return new Date(dateStr);
                                 } else if (pattern === patterns[3]) {
                                   // Unix timestamp
                                   return new Date(parseInt(dateStr) * 1000);
                                 }
                               } catch (e) {
                                 console.error('Error parsing timestamp:', e);
                                 continue;
                               }
                             }
                           }
                           
                           console.log('No timestamp pattern matched for:', filename);
                           return null;
                         };
                         
                         const timestamp = getTimestampFromFilename(fileName || '') || new Date(); // Fallback to current time
                         const formatDate = (date: Date) => {
                           return date.toLocaleString('en-US', {
                             year: 'numeric',
                             month: 'short',
                             day: 'numeric',
                             hour: '2-digit',
                             minute: '2-digit',
                             second: '2-digit'
                           });
                         };
                         
                         return (
                           <div
                             key={index}
                             style={{
                               padding: 12,
                               borderBottom: index < Math.min(jobFiles.length, 10) - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                               background: isCurrentJob ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                               border: isCurrentJob ? '1px solid rgba(34, 197, 94, 0.3)' : 'none',
                               borderRadius: isCurrentJob ? 6 : 0,
                               margin: isCurrentJob ? 4 : 0
                             }}
                           >
                             <div style={{
                               display: 'flex',
                               alignItems: 'center',
                               justifyContent: 'space-between',
                               gap: 12
                             }}>
                               <div style={{ 
                                 display: 'flex', 
                                 alignItems: 'center', 
                                 flex: 1, 
                                 minWidth: 0,
                                 gap: 16
                               }}>
                                 <code style={{
                                   fontSize: 12,
                                   color: isCurrentJob ? '#10b981' : '#cbd5e0',
                                   fontWeight: isCurrentJob ? 600 : 400,
                                   wordBreak: 'break-all',
                                   flex: 1,
                                   minWidth: 0
                                 }}>
                                   {fileName}
                                 </code>
                                 
                                 <div style={{
                                   fontSize: 11,
                                   color: isCurrentJob ? '#6ee7b7' : '#9ca3af',
                                   fontWeight: 400,
                                   whiteSpace: 'nowrap',
                                   flexShrink: 0
                                 }}>
                                   {formatDate(timestamp)}
                                 </div>
                               </div>
                               
                               <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                 {isCurrentJob && (
                                   <span style={{
                                     background: 'rgba(34, 197, 94, 0.2)',
                                     color: '#10b981',
                                     padding: '2px 8px',
                                     borderRadius: 12,
                                     fontSize: 10,
                                     fontWeight: 600
                                   }}>
                                     CURRENT
                                   </span>
                                 )}
                                 
                                 <button
                                   onClick={() => {
                                     // Handle "Next" action - could navigate to job details or download
                                     console.log('Next action for job:', fileName);
                                     // TODO: Implement next action (navigate to job details, download, etc.)
                                   }}
                                   style={{
                                     padding: '4px 12px',
                                     fontSize: 10,
                                     fontWeight: 600,
                                     background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                     color: 'white',
                                     border: 'none',
                                     borderRadius: 6,
                                     cursor: 'pointer',
                                     transition: 'all 0.2s'
                                   }}
                                   onMouseEnter={(e) => {
                                     e.currentTarget.style.transform = 'scale(1.05)';
                                   }}
                                   onMouseLeave={(e) => {
                                     e.currentTarget.style.transform = 'scale(1)';
                                   }}
                                 >
                                   Next
                                 </button>
                               </div>
                             </div>
                           </div>
                         );
                       })}
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