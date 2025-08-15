'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import styles from '../../styles/Home.module.css';
import PageTitle from '../../components/PageTitle';
import Spinner from '../../components/Spinner';
import { JobData } from '../../web/utils/contentPipelineApi';
import { getAppIcon } from '../../utils/fileOperations';
import { useAppDataStore, dataStoreKeys } from '../../hooks/useAppDataStore';
import { contentPipelineApi } from '../../web/utils/contentPipelineApi';
import { ConfigHelpers } from '../../hooks/useAppDataStore.config';

export default function JobsPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  
  // Filter states
  const [userFilter, setUserFilter] = useState<'all' | 'my'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in-progress' | 'completed'>('all');
  
  // Timestamp tracking
  const [jobsListLastUpdate, setJobsListLastUpdate] = useState<string | null>(null);
  const [, forceUpdate] = useState({});

  // Build options for useAppDataStore (memoized to prevent unnecessary re-renders)
  const dataStoreOptions = useMemo(() => ({
    filters: {
      ...(userFilter === 'my' && { userFilter: 'my' }),
      ...(statusFilter !== 'all' && { statusFilter }),
    },
    autoRefresh: true, // Enable auto-refresh polling
  }), [userFilter, statusFilter]);

  // Use centralized data store for jobs list with auto-refresh
  const { 
    data: jobs = [], 
    isLoading, 
    error, 
    refresh: refetch,
    isRefreshing,
    isAutoRefreshActive,
    forceRefreshJobsList
  } = useAppDataStore('jobs', dataStoreOptions);

  // Track jobs list updates
  useEffect(() => {
    if (jobs && jobs.length >= 0) {
      setJobsListLastUpdate(new Date().toISOString());
    }
  }, [jobs]);

  // Update relative timestamps every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate({});
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, []);

  // Extract non-completed job IDs for individual polling
  const nonCompletedJobIds = useMemo(() => {
    if (!jobs || !Array.isArray(jobs)) return [];
    
    const filtered = jobs
      .filter((job: JobData) => {
        const jobStatus = job?.job_status || '';
        const shouldNotPoll = ConfigHelpers.shouldJobNeverPoll(jobStatus);
        return !shouldNotPoll;
      })
      .map((job: JobData) => job.job_id)
      .filter(Boolean); // Remove any undefined/null job IDs

    return filtered;
  }, [jobs]);

  // Use React Query's useQueries for individual job polling
  const individualJobQueries = useQueries({
    queries: nonCompletedJobIds.map(jobId => ({
      queryKey: dataStoreKeys.jobs.detail(jobId),
      queryFn: async () => {
        const response = await contentPipelineApi.getJob(jobId);
        
        return {
          ...response.job,
          api_files: response.job.files,
          files: [],
          content_pipeline_files: [],
          Subset_name: response.job.source_folder
        };
      },
      enabled: true,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) {
          return 5000;
        }
        
        const jobStatus = data.job_status || '';
        const shouldNotPoll = ConfigHelpers.shouldJobNeverPoll(jobStatus);
        
        if (shouldNotPoll) {
          return false;
        }
        
        return 5000; // Poll every 5 seconds
      },
      refetchIntervalInBackground: true,
      staleTime: 0,
      gcTime: 5 * 60 * 1000,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        console.error(`❌ [JobsPage] Individual job query failed for ${jobId} (attempt ${failureCount + 1}):`, error);
        return failureCount < 3;
      },
    })),
  });

  // Create a map of individual job data for easy lookup
  const individualJobsMap = useMemo(() => {
    const map: Record<string, any> = {};
    individualJobQueries.forEach((query, index) => {
      const jobId = nonCompletedJobIds[index];
      if (jobId && query.data) {
        map[jobId] = query.data;
      }
    });
    return map;
  }, [individualJobQueries, nonCompletedJobIds]);

  // Merge jobs list with individual job updates for real-time status
  const enhancedJobs = useMemo(() => {
    if (!jobs) return [];
    
    return jobs.map((job: JobData) => {
      const individualUpdate = individualJobsMap[job.job_id];
      if (individualUpdate) {
        // Use individual job data for more up-to-date status
        return {
          ...job,
          ...individualUpdate,
          // Preserve original created_at and other stable fields from jobs list
          created_at: job.created_at,
          user_name: job.user_name,
        };
      }
      return job;
    });
  }, [jobs, individualJobsMap]);

  // Navigate to job details page - useAppDataStore will handle data consistency
  const viewJobDetails = (job: JobData) => {
    if (!job.job_id) return;
    
    // Set navigation source for cache strategy in job details page
    sessionStorage.setItem('navigationSource', 'jobs-list');
    
    // Simple navigation - useAppDataStore cache will provide consistent data
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
    
    const displayName = parts.length > 0 ? parts.join(' - ') : 'Untitled Job';
    const appIcon = getAppIcon(job.app_name);
    
    return `${appIcon} ${displayName}`;
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

  // Helper function to format relative time
  const getRelativeTime = (timestamp: string) => {
    const now = new Date().getTime();
    const past = new Date(timestamp).getTime();
    const diffInSeconds = Math.floor((now - past) / 1000);
    
    if (diffInSeconds < 5) {
      return 'just now';
    } else if (diffInSeconds < 60) {
      return `${diffInSeconds}s ago`;
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    }
  };

  // Handle manual refresh using centralized data store
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
      <PageTitle title="Physical to Digital Jobs" />
      <div className={styles.content}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
          {/* Enhanced Header Section */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.005))',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 24,
            padding: '32px',
            marginBottom: 16,
            backdropFilter: 'blur(24px)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'flex-start'
            }}>
              {/* Left side: Navigation and Metadata */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                 {/* Navigation Controls - Independent Layout */}
                 <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                   {/* Navigation Toggle - Fixed Width */}
                   <div style={{ 
                     width: 'fit-content',
                     display: 'flex',
                     alignItems: 'center'
                   }}>
                     {/* Enhanced Navigation Tabs */}
                     <div style={{ 
                       display: 'flex', 
                       gap: 0,
                       background: 'rgba(255, 255, 255, 0.03)',
                       borderRadius: 12,
                       padding: 4,
                       backdropFilter: 'blur(8px)',
                       border: '1px solid rgba(255, 255, 255, 0.08)'
                     }}>
                       <button
                                                 onClick={() => setUserFilter('all')}
                         style={{
                           width: '110px',
                           padding: '14px 0',
                           background: userFilter === 'all' 
                             ? 'linear-gradient(135deg, #3b82f6, #1e40af)' 
                             : 'transparent',
                           border: 'none',
                           borderRadius: 8,
                           color: userFilter === 'all' ? '#ffffff' : '#94a3b8',
                           fontSize: '1rem',
                           fontWeight: 600,
                           cursor: 'pointer',
                           transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                           letterSpacing: '-0.01em',
                           whiteSpace: 'nowrap',
                           textAlign: 'center',
                           boxShadow: userFilter === 'all' 
                             ? '0 4px 12px rgba(59, 130, 246, 0.3)' 
                             : 'none',
                           textShadow: userFilter === 'all' 
                             ? '0 1px 2px rgba(0, 0, 0, 0.1)' 
                             : 'none'
                         }}
                         onMouseEnter={(e) => {
                           if (userFilter !== 'all') {
                             e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                             e.currentTarget.style.color = '#e2e8f0';
                             e.currentTarget.style.transform = 'translateY(-1px)';
                           }
                         }}
                         onMouseLeave={(e) => {
                           if (userFilter !== 'all') {
                             e.currentTarget.style.background = 'transparent';
                             e.currentTarget.style.color = '#94a3b8';
                             e.currentTarget.style.transform = 'translateY(0)';
                           }
                         }}
                       >
                         All Jobs
                       </button>
                       <button
                                                 onClick={() => setUserFilter('my')}
                         style={{
                           width: '110px',
                           padding: '14px 0',
                           background: userFilter === 'my' 
                             ? 'linear-gradient(135deg, #3b82f6, #1e40af)' 
                             : 'transparent',
                           border: 'none',
                           borderRadius: 8,
                           color: userFilter === 'my' ? '#ffffff' : '#94a3b8',
                           fontSize: '1rem',
                           fontWeight: 600,
                           cursor: 'pointer',
                           transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                           letterSpacing: '-0.01em',
                           whiteSpace: 'nowrap',
                           textAlign: 'center',
                           boxShadow: userFilter === 'my' 
                             ? '0 4px 12px rgba(59, 130, 246, 0.3)' 
                             : 'none',
                           textShadow: userFilter === 'my' 
                             ? '0 1px 2px rgba(0, 0, 0, 0.1)' 
                             : 'none'
                         }}
                         onMouseEnter={(e) => {
                           if (userFilter !== 'my') {
                             e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                             e.currentTarget.style.color = '#e2e8f0';
                             e.currentTarget.style.transform = 'translateY(-1px)';
                           }
                         }}
                         onMouseLeave={(e) => {
                           if (userFilter !== 'my') {
                             e.currentTarget.style.background = 'transparent';
                             e.currentTarget.style.color = '#94a3b8';
                             e.currentTarget.style.transform = 'translateY(0)';
                           }
                         }}
                       >
                         My Jobs
                       </button>
                     </div>
                   </div>

                   {/* Status Filter - Independent Width */}
                   <div style={{ 
                     position: 'relative',
                     width: 'fit-content',
                     display: 'flex',
                     alignItems: 'center'
                   }}>
                     <select
                       value={statusFilter}
                                             onChange={(e) => {
                        const newStatus = e.target.value as 'all' | 'in-progress' | 'completed';
                        setStatusFilter(newStatus);
                      }}
                       style={{
                         padding: '12px 40px 12px 16px',
                         background: 'rgba(255, 255, 255, 0.04)',
                         border: '1px solid rgba(255, 255, 255, 0.1)',
                         borderRadius: 10,
                         color: '#e2e8f0',
                         fontSize: 14,
                         fontWeight: 500,
                         cursor: 'pointer',
                         outline: 'none',
                         appearance: 'none',
                         transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                         width: '140px',
                         height: '46px',
                         backdropFilter: 'blur(8px)',
                         boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                       }}
                       onMouseEnter={(e) => {
                         e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                         e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                         e.currentTarget.style.transform = 'translateY(-1px)';
                         e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                       }}
                       onMouseLeave={(e) => {
                         e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                         e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                         e.currentTarget.style.transform = 'translateY(0)';
                         e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                       }}
                     >
                       <option value="all" style={{ background: '#1f2937', color: '#f8f8f8' }}>All Status</option>
                       <option value="in-progress" style={{ background: '#1f2937', color: '#f8f8f8' }}>In Progress</option>
                       <option value="completed" style={{ background: '#1f2937', color: '#f8f8f8' }}>Completed</option>
                     </select>
                     <div style={{
                       position: 'absolute',
                       right: 12,
                       top: '50%',
                       transform: 'translateY(-50%)',
                       pointerEvents: 'none',
                       color: '#94a3b8',
                       fontSize: 12,
                       transition: 'transform 0.2s ease'
                     }}>
                       ▼
                     </div>
                     {(statusFilter !== 'all') && (
                       <div style={{
                         position: 'absolute',
                         top: -8,
                         right: 8,
                         width: 8,
                         height: 8,
                         borderRadius: '50%',
                         background: '#f59e0b',
                         border: '2px solid rgba(0, 0, 0, 0.1)'
                       }} />
                     )}
                   </div>
                 </div>

                 {/* Secondary Info - Independent Layout */}
                 <div style={{ 
                   display: 'flex', 
                   alignItems: 'center', 
                   gap: 20,
                   marginTop: -2,
                   width: 'fit-content'
                 }}>
                   {/* Job Count */}
                   <div style={{
                     display: 'flex',
                     alignItems: 'center',
                     gap: 8,
                     color: '#64748b',
                     fontSize: 12
                   }}>
                     <div style={{
                       width: 8,
                       height: 8,
                       borderRadius: '50%',
                       background: '#3b82f6'
                     }} />
                     <span style={{ fontWeight: 500 }}>
                       {enhancedJobs.length} {enhancedJobs.length === 1 ? 'Job' : 'Jobs'}
                     </span>
                   </div>

                   {/* Vertical Divider */}
                   <div style={{
                     width: 1,
                     height: 20,
                     background: 'linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.1), transparent)'
                   }} />

                   {/* Jobs Update Status */}
                   <div style={{
                     display: 'flex',
                     alignItems: 'center',
                     gap: 8,
                     color: '#64748b',
                     fontSize: 12
                   }}>
                     <div style={{
                       width: 8,
                       height: 8,
                       borderRadius: '50%',
                       background: isAutoRefreshActive ? '#10b981' : '#64748b'
                     }} />
                     <span style={{ fontWeight: 500 }}>
                       {isAutoRefreshActive ? (
                         jobsListLastUpdate ? 
                           `Jobs updated ${getRelativeTime(jobsListLastUpdate)}` : 
                           'Jobs loading...'
                       ) : 'Auto-refresh off'}
                       {isRefreshing && ' • Updating...'}
                     </span>
                   </div>
                 </div>
               </div>

               {/* Enhanced Action Section */}
               <div>
                <button
                  onClick={() => router.push('/new-job')}
                  style={{
                    padding: '14px 28px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    border: 'none',
                    borderRadius: 14,
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: 16,
                    fontWeight: 700,
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 8px 24px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                    letterSpacing: '-0.01em',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                    position: 'relative',
                    overflow: 'hidden',
                    height: '46px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                    e.currentTarget.style.boxShadow = '0 12px 32px rgba(16, 185, 129, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
                  }}
                >
                  <span style={{ position: 'relative', zIndex: 1 }}>➕ New</span>
                </button>
              </div>
            </div>
          </div>

          {enhancedJobs.length === 0 ? (
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
              {enhancedJobs.map((job) => (
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
                          {/* Show extraction progress when status is extracting */}
                          {job.job_status?.toLowerCase() === 'extracting' && 
                           job.extracted_files_total_count && 
                           parseInt(job.extracted_files_total_count) > 0 && (
                            <span style={{ 
                              fontSize: 12, 
                              fontWeight: 500,
                              marginLeft: 4,
                              opacity: 0.9
                            }}>
                              ({job.extracted_files_completed_count || 0}/{job.extracted_files_total_count} files)
                            </span>
                          )}
                          {/* Show generation progress when status is generating */}
                          {job.job_status?.toLowerCase() === 'generating' && 
                           job.firefly_assets_total_count && 
                           parseInt(job.firefly_assets_total_count) > 0 && (
                            <span style={{ 
                              fontSize: 12, 
                              fontWeight: 500,
                              marginLeft: 4,
                              opacity: 0.9
                            }}>
                              ({job.firefly_assets_completed_count || 0}/{job.firefly_assets_total_count} assets)
                            </span>
                          )}
                        </span>
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>
                          📁 {job.files?.length || 0}
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
                    
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                      {/* Action Required indicator for extracted jobs */}
                      {job.job_status?.toLowerCase() === 'extracted' && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 500,
                          color: '#f59e0b',
                          fontStyle: 'italic'
                        }}>
                          <span style={{ fontSize: 14 }}>⚡</span>
                          Action Required
                        </div>
                      )}
                      
                      {/* Only show View Details button when not actively processing */}
                      {!['uploading', 'extracting', 'generating'].includes(job.job_status?.toLowerCase() || '') && (
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
                      )}
                      
                      {/* Show processing indicator when actively processing */}
                      {['uploading', 'extracting', 'generating'].includes(job.job_status?.toLowerCase() || '') && (
                        <div style={{
                          padding: '8px 16px',
                          background: 'rgba(245, 158, 11, 0.1)',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          borderRadius: 6,
                          color: '#f59e0b',
                          fontSize: 14,
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}>
                          <div style={{
                            width: 12,
                            height: 12,
                            border: '2px solid rgba(245, 158, 11, 0.3)',
                            borderTop: '2px solid #f59e0b',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                          }} />
                          Processing...
                        </div>
                      )}
                      {job.user_name && (
                        <span style={{ color: '#9ca3af', fontSize: 12, marginTop: 8 }}>
                          Created by: {job.user_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Add CSS animation for spinner */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
} 