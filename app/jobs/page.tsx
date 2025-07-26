'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import styles from '../../styles/Home.module.css';
import Spinner from '../../components/Spinner';
import { contentPipelineApi, JobData } from '../../web/utils/contentPipelineApi';

export default function JobsPage() {
  const router = useRouter();

  // React Query to fetch and cache jobs data
  const { 
    data: jobs = [], 
    isLoading, 
    error, 
    refetch,
    isRefetching 
  } = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      console.log('Fetching jobs from Content Pipeline API...');
      const response = await contentPipelineApi.listJobs();
      console.log('Jobs fetched:', response);
      
      // Sort jobs by creation date (most recent first)
      const sortedJobs = response.jobs.sort((a, b) => 
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
      
      return sortedJobs;
    },
    // Refetch every 5 seconds to match the original background refresh
    refetchInterval: 5000,
    // Keep previous data while refetching to prevent UI flicker
    placeholderData: (previousData) => previousData,
    // Consider data stale immediately to ensure real-time status updates
    staleTime: 0,
    // Cache data for 10 minutes
    gcTime: 10 * 60 * 1000,
    // Retry failed requests
    retry: 3,
    // Refetch on window focus for real-time updates
    refetchOnWindowFocus: true,
  });

  // Navigate to job details page - React Query will handle data fetching
  const viewJobDetails = (job: JobData) => {
    if (!job.job_id) return;
    
    // Simple navigation - React Query cache will provide the data
    router.push(`/job/details?jobId=${job.job_id}`);
  };

  const getSubsetName = (job: JobData) => {
    if (!job.source_folder) return 'Unknown';
    const parts = job.source_folder.split('/');
    return parts.length > 0 ? parts[0] : 'Unknown';
  };

  const getJobDisplayName = (job: JobData) => {
    const parts = [];
    
    if (job.app_name) parts.push(job.app_name);
    if (job.filename_prefix) parts.push(job.filename_prefix);
    
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

  // Handle manual refresh
  const handleRefresh = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
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
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <h2 style={{ color: '#ef4444', marginBottom: 16 }}>❌ Error Loading Jobs</h2>
            <p style={{ color: '#e0e0e0', marginBottom: 24 }}>
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
            <button
              onClick={handleRefresh}
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
                onClick={handleRefresh}
                disabled={isRefetching}
                style={{
                  padding: '8px 16px',
                  background: isRefetching ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: 8,
                  color: isRefetching ? '#9ca3af' : '#60a5fa',
                  cursor: isRefetching ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  transition: 'all 0.2s',
                  opacity: isRefetching ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <div style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isRefetching ? (
                    <div style={{
                      width: 16,
                      height: 16,
                      border: '2px solid transparent',
                      borderTop: '2px solid currentColor',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                  ) : (
                    <span style={{ fontSize: 16 }}>🔄</span>
                  )}
                </div>
                Refresh
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