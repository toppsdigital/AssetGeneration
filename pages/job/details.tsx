import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import NavBar from '../../components/NavBar';
import styles from '../../styles/Edit.module.css';
import Spinner from '../../components/Spinner';

interface JobData {
  job_id: string;
  job_status: string;
  source_folder: string;
  template: string;
  psd_file?: string;
  total_files: number;
  files: JobFile[];
  timestamp?: string;
}

interface JobFile {
  filename: string;
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
  const { jobPath } = router.query;
  
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (jobPath) {
      loadJobDetails();
    }
  }, [jobPath]);

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
          showViewJobs
          onHome={() => router.push('/')}
          onViewJobs={() => router.push('/jobs')}
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
          showViewJobs
          onHome={() => router.push('/')}
          onViewJobs={() => router.push('/jobs')}
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
          showViewJobs
          onHome={() => router.push('/')}
          onViewJobs={() => router.push('/jobs')}
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
        showViewJobs
        onHome={() => router.push('/')}
        onViewJobs={() => router.push('/jobs')}
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

            {/* Files Details */}
            {jobData.files && jobData.files.length > 0 && (
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

                        {/* Extracted Layers */}
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
                              🖼️ Extracted Layers ({file.extracted_files?.length || 0})
                            </h4>
                            {file.extracted_files && file.extracted_files.length > 0 && (
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
                            )}
                          </div>
                          <div style={{
                            background: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            borderRadius: 8,
                            padding: 12,
                            maxHeight: 200,
                            overflowY: 'auto'
                          }}>
                            {file.extracted_files && file.extracted_files.length > 0 ? (
                              file.extracted_files.map((extractedFile, extIndex) => (
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
                              ))
                            ) : (
                              <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>
                                No extracted layers found
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Firefly Assets - Full Width Below */}
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
                            🎨 Firefly Assets ({file.firefly_assets?.length || 0})
                          </h4>
                          {file.firefly_assets && file.firefly_assets.length > 0 && (
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
                          )}
                        </div>
                        <div style={{
                          background: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          borderRadius: 8,
                          padding: 12
                        }}>
                          {file.firefly_assets && file.firefly_assets.length > 0 ? (
                            file.firefly_assets.map((asset, assetIndex) => (
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
                            ))
                          ) : (
                            <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>
                              No firefly assets found
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No Files Message */}
            {(!jobData.files || jobData.files.length === 0) && (
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