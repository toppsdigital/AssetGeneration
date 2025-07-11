'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../../styles/Home.module.css';
import NavBar from '../../components/NavBar';
import Spinner from '../../components/Spinner';
import { contentPipelineApi, JobData } from '../../web/utils/contentPipelineApi';

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all jobs from Content Pipeline API
  const fetchJobs = async (isBackgroundUpdate = false) => {
    if (!isBackgroundUpdate) {
      setLoading(true);
      setError(null);
    }
    
    try {
      console.log(`Fetching jobs from Content Pipeline API... ${isBackgroundUpdate ? '(background)' : ''}`);
      const response = await contentPipelineApi.listJobs();
      console.log('Jobs fetched:', response);
      
      // Sort jobs by creation date (most recent first)
      const sortedJobs = response.jobs.sort((a, b) => 
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
      
      setJobs(sortedJobs);
      
      // Clear any existing errors on successful fetch
      if (error) {
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
      // Only set error state for non-background updates to avoid disrupting UI
      if (!isBackgroundUpdate) {
        setError((err as Error).message);
      }
    } finally {
      if (!isBackgroundUpdate) {
        setLoading(false);
      }
    }
  };

  // Navigate to job details page
  const viewJobDetails = (job: JobData) => {
    if (!job.job_id) return;
    
    // Pass job data to reduce API calls in details page
    const queryParams = new URLSearchParams({
      jobId: job.job_id,
      appName: job.app_name || '',
      releaseName: job.release_name || '',
      sourceFolder: job.source_folder || '',
      status: job.job_status || '',
      createdAt: job.created_at || '',
      files: JSON.stringify(job.files || []),
      description: job.description || ''
    });
    
    router.push(`/job/details?${queryParams.toString()}`);
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // Set up background refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchJobs(true); // Background update
    }, 5000); // 5 seconds

    // Cleanup interval on component unmount
    return () => clearInterval(interval);
  }, []);

  const getSubsetName = (job: JobData) => {
    if (!job.source_folder) return 'Unknown';
    const parts = job.source_folder.split('/');
    return parts.length > 0 ? parts[0] : 'Unknown';
  };

  const getJobDisplayName = (job: JobData) => {
    const parts = [];
    
    if (job.app_name) parts.push(job.app_name);
    if (job.release_name) parts.push(job.release_name);
    
    // Add subset name from source_folder
    const subsetName = getSubsetName(job);
    if (subsetName && subsetName !== 'Unknown' && subsetName !== job.app_name) {
      parts.push(subsetName);
    }
    
    return parts.length > 0 ? parts.join(' - ') : 'Untitled Job';
  };

  const getStatusColor = (status: string | undefined) => {
    if (!status) return '#9ca3af'; // Gray for unknown status
    
    const lowerStatus = status.toLowerCase();
    
    // Green for completed/successful states
    if (lowerStatus.includes('completed') || lowerStatus.includes('generated')) return '#10b981';
    
    // Red for failed/error states
    if (lowerStatus.includes('failed') || lowerStatus.includes('error')) return '#ef4444';
    
    // Yellow for in-progress states
    if (lowerStatus.includes('uploading') || lowerStatus.includes('extracting') || 
        lowerStatus.includes('generating')) return '#f59e0b';
    
    // Blue for uploaded state
    if (lowerStatus.includes('uploaded') || lowerStatus.includes('extracted')) return '#3b82f6';
    
    // Default gray
    return '#9ca3af';
  };

  const getStatusIcon = (status: string | undefined) => {
    if (!status) return '❓';
    
    const lowerStatus = status.toLowerCase();
    
    if (lowerStatus.includes('completed') || lowerStatus.includes('generated')) return '✅';
    if (lowerStatus.includes('failed') || lowerStatus.includes('error')) return '❌';
    if (lowerStatus.includes('uploading') || lowerStatus.includes('extracting') || 
        lowerStatus.includes('generating')) return '⏳';
    if (lowerStatus.includes('uploaded') || lowerStatus.includes('extracted')) return '🔄';
    
    return '📋';
  };

  const capitalizeStatus = (status: string) => {
    if (!status) return '';
    return status.charAt(0).toUpperCase() + status.slice(1);
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
              onClick={() => fetchJobs(false)}
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
                onClick={() => fetchJobs(false)}
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
                          📅 {new Date(job.created_at || '').toLocaleString()}
                        </span>
                        <span style={{ color: '#9ca3af', fontSize: 14 }}>
                          📂 {getSubsetName(job)}
                        </span>
                        <span style={{ 
                          color: getStatusColor(job.job_status),
                          fontSize: 14,
                          fontWeight: 600
                        }}>
                          {getStatusIcon(job.job_status)} {capitalizeStatus(job.job_status || 'Unknown Status')}
                        </span>
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>
                          📁 {job.files?.length || 0} files
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
                      <button
                        onClick={() => viewJobDetails(job)}
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