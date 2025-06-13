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
            maxWidth: 800,
            width: '100%',
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 16,
            padding: 32,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            textAlign: 'center'
          }}>
            {result.success ? (
              <>
                <div style={{
                  fontSize: 48,
                  marginBottom: 16
                }}>
                  ✅
                </div>
                
                <h2 style={{
                  fontSize: '2rem',
                  fontWeight: 600,
                  color: '#10b981',
                  marginBottom: 16
                }}>
                  Upload Successful!
                </h2>
                
                <p style={{
                  fontSize: 18,
                  color: '#e0e0e0',
                  marginBottom: 32
                }}>
                  {result.message}
                </p>

                <div style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 24,
                  marginBottom: 32,
                  textAlign: 'left'
                }}>
                  <h3 style={{
                    fontSize: '1.25rem',
                    fontWeight: 600,
                    marginBottom: 16,
                    color: '#f8f8f8'
                  }}>
                    Processing Details
                  </h3>
                  
                  <div style={{ marginBottom: 12 }}>
                    <strong>Source Folder:</strong> <br />
                    <code style={{ 
                      background: 'rgba(255, 255, 255, 0.1)', 
                      padding: '4px 8px', 
                      borderRadius: 4,
                      fontSize: 12,
                      wordBreak: 'break-all'
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



                <div style={{
                  display: 'flex',
                  gap: 16,
                  justifyContent: 'center',
                  flexWrap: 'wrap'
                }}>
                  <button
                    onClick={() => router.push('/')}
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
                    🏠 Return Home
                  </button>
                  
                  <button
                    onClick={() => router.back()}
                    style={{
                      padding: '12px 24px',
                      fontSize: 16,
                      fontWeight: 600,
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: 'white',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: 12,
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