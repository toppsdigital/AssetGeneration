'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import styles from '../../styles/Home.module.css';
import PageTitle from '../../components/PageTitle';
import Spinner from '../../components/Spinner';
import { contentPipelineApi, JobData } from '../../web/utils/contentPipelineApi';

export default function JobsPage() {
  const router = useRouter();
  
  const { data: jobsResponse, isLoading, error, refetch } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => contentPipelineApi.listJobs(),
    staleTime: 0, // Always fetch fresh data
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const jobs = jobsResponse?.jobs || [];

  const handleJobClick = (jobId: string) => {
    router.push(`/job/details?jobId=${jobId}`);
  };

  const handleRefresh = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <PageTitle title="Physical to Digital Jobs" />
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
        <PageTitle title="Physical to Digital Jobs" />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <h2 style={{ color: '#ef4444', marginBottom: 16 }}>❌ Error Loading Jobs</h2>
            <p style={{ color: '#e0e0e0', marginBottom: 24 }}>
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
            <button 
              onClick={handleRefresh}
              style={{
                backgroundColor: '#8b5cf6',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '500'
              }}
            >
              🔄 Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <PageTitle title="Physical to Digital Jobs" />
      <div className={styles.content}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: '32px' 
          }}>
            <div>
              <p style={{ color: '#e0e0e0', margin: 0 }}>
                {jobs.length || 0} {jobs.length === 1 ? 'job' : 'jobs'} found
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={handleRefresh}
                style={{
                  backgroundColor: 'rgba(244, 114, 182, 0.15)',
                  color: '#fce7f3',
                  border: '1px solid rgba(244, 114, 182, 0.25)',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                🔄 Refresh
              </button>
              <button 
                onClick={() => router.push('/new-job')}
                style={{
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                ➕ New Job
              </button>
            </div>
          </div>

          {/* Jobs Grid */}
          {jobs && jobs.length > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
              gap: '24px'
            }}>
              {jobs.map((job: JobData) => (
                <div
                  key={job.job_id}
                  onClick={() => handleJobClick(job.job_id)}
                  style={{
                    background: 'linear-gradient(135deg, rgba(45, 27, 105, 0.8) 0%, rgba(17, 9, 43, 0.8) 100%)',
                    border: '1px solid rgba(244, 114, 182, 0.2)',
                    borderRadius: '12px',
                    padding: '24px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(244, 114, 182, 0.4)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(244, 114, 182, 0.2)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ 
                      color: '#fce7f3', 
                      margin: '0 0 8px 0',
                      fontSize: '1.1rem',
                      fontWeight: '600'
                    }}>
                      {job.app_name || 'Unknown App'}
                    </h3>
                    <p style={{ 
                      color: 'rgba(252, 231, 243, 0.7)', 
                      margin: 0,
                      fontSize: '0.9rem'
                    }}>
                      {job.filename_prefix || job.job_id}
                    </p>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ 
                      display: 'inline-block',
                      backgroundColor: getStatusColor(job.job_status),
                      color: 'white',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      fontWeight: '500'
                    }}>
                      {job.job_status || 'Unknown'}
                    </div>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'rgba(252, 231, 243, 0.6)' }}>
                    Created: {job.created_at ? new Date(job.created_at).toLocaleDateString() : 'Unknown'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
              <h2 style={{ color: '#fce7f3', marginBottom: '16px' }}>No Jobs Found</h2>
              <p style={{ color: 'rgba(252, 231, 243, 0.7)', marginBottom: '24px' }}>
                Get started by creating your first job.
              </p>
              <button 
                onClick={() => router.push('/new-job')}
                style={{
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: '500'
                }}
              >
                Create New Job
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'completed':
      return '#10b981';
    case 'processing':
    case 'uploading':
      return '#f59e0b';
    case 'error':
    case 'failed':
      return '#ef4444';
    case 'extracted':
      return '#8b5cf6';
    default:
      return '#6b7280';
  }
} 