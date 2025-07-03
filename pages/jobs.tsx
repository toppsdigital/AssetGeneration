import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/Home.module.css';
import NavBar from '../components/NavBar';
import Spinner from '../components/Spinner';
import { contentPipelineApi, JobData } from '../web/utils/contentPipelineApi';

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all jobs from Content Pipeline API
  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('Fetching jobs from Content Pipeline API...');
      const response = await contentPipelineApi.listJobs();
      console.log('Jobs fetched:', response);
      
      // Sort jobs by creation date (most recent first)
      const sortedJobs = response.jobs.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      setJobs(sortedJobs);
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Navigate to job details page
  const viewJobDetails = (jobId: string | undefined) => {
    if (!jobId) return;
    router.push(`/job/details?jobId=${encodeURIComponent(jobId)}`);
  };

  // Execute appropriate action based on job status
  const executeJobAction = async (job: JobData) => {
    const status = job.job_status?.toLowerCase() || '';
    
    if (status.includes('upload completed')) {
      // Start PDF extraction
      await startPdfExtraction(job);
    } else if (status.includes('extraction completed')) {
      // Create digital assets
      await createDigitalAssets(job);
    } else if (status.includes('digital assets completed') || status.includes('digital assets succeeded')) {
      // Preview assets
      previewAssets(job);
    } else {
      // Default to viewing details
      viewJobDetails(job.job_id);
    }
  };

  // Start PDF extraction for a job
  const startPdfExtraction = async (job: JobData) => {
    if (!job.job_id) return;
    
    try {
      // Update job status to show it's processing
      await contentPipelineApi.updateJobStatus(job.job_id, 'PDF extraction started');
      
      // Update local state
      setJobs(prev => prev.map(j => 
        j.job_id === job.job_id 
          ? { ...j, job_status: 'PDF extraction started' }
          : j
      ));
      
      // Here you would typically call your PDF extraction API
      // For now, we'll just show a message
      alert('PDF extraction started for job: ' + job.job_id);
      
      // Refresh jobs after a delay
      setTimeout(() => {
        fetchJobs();
      }, 2000);

    } catch (error) {
      console.error('Error starting extraction:', error);
      alert('Failed to start PDF extraction: ' + (error as Error).message);
    }
  };

  // Create digital assets for a job
  const createDigitalAssets = async (job: JobData) => {
    if (!job.job_id) return;
    
    try {
      // Update job status to show it's processing
      await contentPipelineApi.updateJobStatus(job.job_id, 'Digital asset creation started');
      
      // Update local state
      setJobs(prev => prev.map(j => 
        j.job_id === job.job_id 
          ? { ...j, job_status: 'Digital asset creation started' }
          : j
      ));
      
      // Here you would typically call your digital asset creation API
      // For now, we'll just show a message
      alert('Digital asset creation started for job: ' + job.job_id);
      
      // Refresh jobs after a delay
      setTimeout(() => {
        fetchJobs();
      }, 5000);

    } catch (error) {
      console.error('Error starting asset creation:', error);
      alert('Failed to start digital asset creation: ' + (error as Error).message);
    }
  };

  // Preview assets for a job
  const previewAssets = (job: JobData) => {
    if (!job.job_id) return;
    
    router.push({
      pathname: '/job/preview',
      query: {
        jobId: job.job_id
      }
    });
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // Auto-refresh in-progress jobs every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshInProgressJobs();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [jobs]);

  const getJobDisplayName = (job: JobData) => {
    if (job.app_name && job.release_name) {
      return `${job.app_name} - ${job.release_name}`;
    }
    return job.app_name || job.release_name || 'Untitled Job';
  };

  const getStatusColor = (status: string | undefined) => {
    if (!status) return '#9ca3af'; // Gray for unknown status
    
    const lowerStatus = status.toLowerCase();
    
    // Green for completed/successful states
    if (lowerStatus.includes('succeed') || lowerStatus.includes('completed')) return '#10b981';
    
    // Red for failed/error states
    if (lowerStatus.includes('fail') || lowerStatus.includes('error')) return '#ef4444';
    
    // Yellow for in-progress states
    if (lowerStatus.includes('progress') || lowerStatus.includes('running') || 
        lowerStatus.includes('processing') || lowerStatus.includes('started')) return '#f59e0b';
    
    // Blue for other active states
    return '#3b82f6';
  };

  const getActionButtonText = (status: string | undefined) => {
    if (!status) return 'View Details';
    
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('upload completed')) return 'Start PDF Extraction';
    if (lowerStatus.includes('extraction completed')) return 'Create Digital Assets';
    if (lowerStatus.includes('digital assets completed') || lowerStatus.includes('digital assets succeeded')) return 'Preview Assets';
    return 'View Details';
  };

  const refreshInProgressJobs = async () => {
    // Get all jobs that are in progress
    const inProgressJobs = jobs.filter(job => {
      if (!job.job_status) return false;
      const status = job.job_status.toLowerCase();
      return status.includes('progress') || 
             status.includes('running') || 
             status.includes('processing') || 
             status.includes('started');
    });

    if (inProgressJobs.length === 0) {
      return;
    }

    console.log(`Refreshing ${inProgressJobs.length} in-progress jobs...`);
    
    try {
      // Refresh all jobs - simpler approach
      await fetchJobs();
    } catch (error) {
      console.error('Error refreshing in-progress jobs:', error);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <NavBar 
          showHome
          onHome={() => router.push('/')}
          title="Job Management"
        />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <Spinner />
            <p style={{ marginTop: 16, color: '#e0e0e0' }}>Loading jobs...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <NavBar 
          showHome
          onHome={() => router.push('/')}
          title="Job Management"
        />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <h2 style={{ color: '#ef4444', marginBottom: 16 }}>❌ Error Loading Jobs</h2>
            <p style={{ color: '#e0e0e0', marginBottom: 24 }}>{error}</p>
            <button
              onClick={fetchJobs}
              style={{
                padding: '12px 24px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 16
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <NavBar 
        showHome
        onHome={() => router.push('/')}
        title="Job Management"
      />
      <div className={styles.content}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: 24 
          }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 600, color: '#f8f8f8' }}>
              All Jobs ({jobs.length})
            </h1>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => router.push('/new-job')}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none',
                  borderRadius: 8,
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                ➕ New Job
              </button>
              <button
                onClick={fetchJobs}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: 8,
                  color: '#60a5fa',
                  cursor: 'pointer',
                  fontSize: 14
                }}
              >
                🔄 Refresh All
              </button>
            </div>
          </div>

          {jobs.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '48px 0',
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: 12,
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
              <h3 style={{ color: '#9ca3af', fontSize: 18, marginBottom: 8 }}>No Jobs Found</h3>
              <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
                Create your first job to get started with processing PDFs into digital assets
              </p>
              <button
                onClick={() => router.push('/new-job')}
                style={{
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none',
                  borderRadius: 8,
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                ➕ Create New Job
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {jobs.map((job) => (
                <div
                  key={job.job_id}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 12,
                    padding: 20,
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <h3 style={{ 
                          fontSize: '1.2rem', 
                          fontWeight: 600, 
                          color: '#f8f8f8',
                          margin: 0
                        }}>
                          {getJobDisplayName(job)}
                        </h3>
                      </div>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ color: '#9ca3af', fontSize: 14 }}>
                          📅 {new Date(job.created_at).toLocaleString()}
                        </span>
                        <span style={{ 
                          color: getStatusColor(job.job_status),
                          fontSize: 14,
                          fontWeight: 600
                        }}>
                          {(() => {
                            if (!job.job_status) return '❓';
                            const status = job.job_status.toLowerCase();
                            if (status.includes('succeed') || status.includes('completed')) return '✅';
                            if (status.includes('fail') || status.includes('error')) return '❌';
                            if (status.includes('progress') || status.includes('running') || 
                                status.includes('processing') || status.includes('started')) return '⏳';
                            return '🔄';
                          })()} {job.job_status || 'Unknown Status'}
                        </span>
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>
                          🏢 {job.app_name}
                        </span>
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>
                          🚀 {job.release_name}
                        </span>
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>
                          📁 {job.files.length} files
                        </span>
                      </div>
                      {job.description && (
                        <p style={{ 
                          color: '#9ca3af', 
                          fontSize: 14, 
                          marginTop: 8, 
                          marginBottom: 0,
                          fontStyle: 'italic'
                        }}>
                          {job.description}
                        </p>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {(() => {
                        const status = job.job_status?.toLowerCase() || '';
                        const isInProgress = status.includes('progress') || 
                                           status.includes('running') || 
                                           status.includes('processing') || 
                                           status.includes('started');
                        
                        // Show buttons for in-progress jobs too
                        if (isInProgress) {
                          return (
                            <>
                              <button
                                onClick={() => viewJobDetails(job.job_id)}
                                style={{
                                  padding: '8px 16px',
                                  background: 'rgba(255, 255, 255, 0.1)',
                                  border: '1px solid rgba(255, 255, 255, 0.2)',
                                  borderRadius: 6,
                                  color: '#e5e7eb',
                                  cursor: 'pointer',
                                  fontSize: 14,
                                  fontWeight: 500,
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                }}
                              >
                                📋 View Details
                              </button>
                            </>
                          );
                        }
                        
                        // Show action buttons when not in progress
                        return (
                          <>
                            <button
                              onClick={() => viewJobDetails(job.job_id)}
                              style={{
                                padding: '8px 16px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                borderRadius: 6,
                                color: '#e5e7eb',
                                cursor: 'pointer',
                                fontSize: 14,
                                fontWeight: 500,
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                              }}
                            >
                              📋 View Details
                            </button>
                            {!status.includes('digital assets succeeded') && (
                              <button
                                onClick={() => executeJobAction(job)}
                                style={{
                                  padding: '8px 16px',
                                  background: status.includes('digital assets completed') || 
                                             status.includes('digital assets succeeded')
                                    ? 'linear-gradient(135deg, #10b981, #059669)'
                                    : status.includes('upload completed') ||
                                      status.includes('extraction completed')
                                    ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                    : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  fontSize: 14,
                                  fontWeight: 600,
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = 'scale(1.05)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'scale(1)';
                                }}
                              >
                                {getActionButtonText(job.job_status)}
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 