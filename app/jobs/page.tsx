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
      viewJobDetails(job);
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
    
    router.push(`/job/preview?jobId=${job.job_id}`);
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

  const refreshInProgressJobs = async () => {
    // Only refresh if we have jobs and some are in-progress
    const inProgressJobs = jobs.filter(job => {
      const status = job.job_status?.toLowerCase() || '';
      return status.includes('progress') || status.includes('running') || 
             status.includes('processing') || status.includes('started');
    });
    
    if (inProgressJobs.length > 0) {
      await fetchJobs();
    }
  };

  const getJobDisplayName = (job: JobData) => {
    const parts = [];
    
    if (job.app_name) parts.push(job.app_name);
    if (job.release_name) parts.push(job.release_name);
    if (job.source_folder) {
      // Extract subset from source_folder (e.g., "MARVEL/PDFs" -> "MARVEL")
      const subset = job.source_folder.split('/')[0];
      if (subset && subset !== job.app_name) {
        parts.push(subset);
      }
    }
    
    return parts.length > 0 ? parts.join(' - ') : 'Untitled Job';
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
    if (lowerStatus.includes('fail') || lowerStatus.includes('error')) return 'View Error Details';
    
    return 'View Details';
  };

  const goHome = () => {
    router.push('/');
  };

  const goToNewJob = () => {
    router.push('/new-job');
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <NavBar title="Jobs" />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spinner />
            <p style={{ marginTop: '20px', color: '#666' }}>Loading jobs...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <NavBar title="Jobs" />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <h2 style={{ color: '#ef4444', marginBottom: '20px' }}>Error Loading Jobs</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>{error}</p>
            <button 
              onClick={fetchJobs}
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
              onClick={goHome}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <NavBar title="Jobs" />
      <div className={styles.content}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>All Jobs ({jobs.length})</h2>
          <div>
            <button 
              onClick={goToNewJob}
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
              New Job
            </button>
            <button 
              onClick={fetchJobs}
              style={{
                padding: '10px 20px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Refresh
            </button>
          </div>
        </div>
        
        {jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ color: '#666', marginBottom: '20px' }}>No jobs found</p>
            <button 
              onClick={goToNewJob}
              style={{
                padding: '12px 24px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Create Your First Job
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {jobs.map((job) => (
              <div 
                key={job.job_id || `job-${Math.random()}`}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '16px',
                  backgroundColor: 'white',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0, marginBottom: '4px', color: '#1f2937' }}>
                      {getJobDisplayName(job)}
                    </h3>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                      ID: {job.job_id || 'Unknown'}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div 
                      style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        backgroundColor: getStatusColor(job.job_status) + '20',
                        color: getStatusColor(job.job_status)
                      }}
                    >
                      {job.job_status || 'Unknown'}
                    </div>
                  </div>
                </div>
                
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ margin: '2px 0', fontSize: '14px', color: '#4b5563' }}>
                    <strong>Files:</strong> {job.files?.length || 0}
                  </p>
                  <p style={{ margin: '2px 0', fontSize: '14px', color: '#4b5563' }}>
                    <strong>Created:</strong> {job.created_at ? new Date(job.created_at).toLocaleDateString() : 'Unknown'}
                  </p>
                  {job.description && (
                    <p style={{ margin: '2px 0', fontSize: '14px', color: '#4b5563' }}>
                      <strong>Description:</strong> {job.description}
                    </p>
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => executeJobAction(job)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    {getActionButtonText(job.job_status)}
                  </button>
                  <button 
                    onClick={() => viewJobDetails(job)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 