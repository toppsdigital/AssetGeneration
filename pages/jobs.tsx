import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/Home.module.css';
import NavBar from '../components/NavBar';
import Spinner from '../components/Spinner';

interface JobFile {
  name: string;
  lastModified: string | null;
  jobData?: any;
  loading?: boolean;
}

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  // Fetch all job files from S3
  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_method: 'list' }),
      });
      
      if (!res.ok) throw new Error('Failed to fetch job files');
      const data = await res.json();
      
      // Filter for job files in Jobs/ directory
      const jobFiles = data.files.filter((file: any) => {
        const fileName = typeof file === 'string' ? file : file.name;
        return fileName.startsWith('asset_generator/dev/uploads/Jobs/') && fileName.endsWith('.json');
      });
      
      // Sort by last modified date (most recent first)
      const sortedJobs = jobFiles.sort((a: any, b: any) => {
        const aFileName = typeof a === 'string' ? a : a.name;
        const bFileName = typeof b === 'string' ? b : b.name;
        const aModified = typeof a === 'string' ? null : a.lastModified;
        const bModified = typeof b === 'string' ? null : b.lastModified;
        
        if (aModified && bModified) {
          return new Date(bModified).getTime() - new Date(aModified).getTime();
        }
        
        // Fallback to filename comparison
        return bFileName.localeCompare(aFileName);
      });
      
      const jobsWithMetadata = sortedJobs.map((file: any) => ({
        name: typeof file === 'string' ? file : file.name,
        lastModified: typeof file === 'string' ? null : file.lastModified,
        loading: false
      }));
      
      setJobs(jobsWithMetadata);
      
      // Automatically fetch job data for all jobs
      await fetchAllJobDetails(jobsWithMetadata);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch job details for all jobs
  const fetchAllJobDetails = async (jobList: JobFile[]) => {
    const promises = jobList.map(async (job) => {
      try {
        const relativePath = job.name.replace('asset_generator/dev/uploads/', '');
        const res = await fetch('/api/s3-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            client_method: 'get', 
            filename: relativePath,
            download: true 
          }),
        });
        
        if (!res.ok) throw new Error('Failed to fetch job details');
        const jobData = await res.json();
        
        return { ...job, jobData };
      } catch (err) {
        console.error(`Error fetching job details for ${job.name}:`, err);
        return { ...job, jobData: null };
      }
    });

    const jobsWithData = await Promise.all(promises);
    setJobs(jobsWithData);
  };

  // Fetch job details for a specific job
  const fetchJobDetails = async (jobName: string) => {
    setJobs(prev => prev.map(job => 
      job.name === jobName ? { ...job, loading: true } : job
    ));
    
    try {
      const relativePath = jobName.replace('asset_generator/dev/uploads/', '');
      const res = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          client_method: 'get', 
          filename: relativePath,
          download: true 
        }),
      });
      
      if (!res.ok) throw new Error('Failed to fetch job details');
      const jobData = await res.json();
      
      setJobs(prev => prev.map(job => 
        job.name === jobName ? { ...job, jobData, loading: false } : job
      ));
    } catch (err) {
      console.error('Error fetching job details:', err);
      setJobs(prev => prev.map(job => 
        job.name === jobName ? { ...job, loading: false } : job
      ));
    }
  };

  // Toggle job expansion and fetch details if needed
  const toggleJobExpansion = (jobName: string) => {
    if (expandedJob === jobName) {
      setExpandedJob(null);
    } else {
      setExpandedJob(jobName);
      const job = jobs.find(j => j.name === jobName);
      if (job && !job.jobData && !job.loading) {
        fetchJobDetails(jobName);
      }
    }
  };

  // Navigate to processing page for a specific job
  const viewJobProcessing = (job: JobFile) => {
    if (!job.jobData) return;
    
    // Extract template name from job data or filename
    const templateName = job.jobData.template || 'Unknown';
    const cleanTemplateName = templateName.replace('.json', '');
    
    router.push({
      pathname: `/${cleanTemplateName}/extraction-processing`,
      query: { 
        uploadResult: JSON.stringify({
          success: true,
          jobId: job.jobData.job_id || 'unknown',
          message: 'Viewing existing job',
          folderPath: job.jobData.source_folder || 'Unknown',
          metadata: {
            template: templateName,
            layerEdits: null
          }
        })
      },
    });
  };

  // Execute appropriate action based on job status
  const executeJobAction = async (job: JobFile) => {
    if (!job.jobData) return;
    
    const status = job.jobData.job_status?.toLowerCase() || '';
    
    if (status.includes('upload completed')) {
      // Start PDF extraction
      await startPdfExtraction(job);
    } else if (status.includes('extraction completed')) {
      // Create digital assets
      await createDigitalAssets(job);
    } else if (status.includes('digital assets completed') || status.includes('digital assets succeeded')) {
      // Preview assets
      previewAssets(job);
    }
  };

  // Start PDF extraction for a job
  const startPdfExtraction = async (job: JobFile) => {
    if (!job.jobData) return;
    
    try {
      const jobFilePath = job.name.replace('asset_generator/dev/uploads/', '');
      
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
      
      // Update job status to show it's processing
      setJobs(prev => prev.map(j => 
        j.name === job.name 
          ? { ...j, jobData: { ...j.jobData, job_status: 'PDF extraction started...' } }
          : j
      ));
      
      // Refresh job data after a delay
      setTimeout(() => {
        fetchJobDetails(job.name);
      }, 5000);

    } catch (error) {
      console.error('Error starting extraction:', error);
      alert('Failed to start PDF extraction: ' + (error as Error).message);
    }
  };

  // Create digital assets for a job
  const createDigitalAssets = async (job: JobFile) => {
    if (!job.jobData) return;
    
    try {
      const jobFilePath = job.name.replace('asset_generator/dev/uploads/', '');
      
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
      
      // Update job status to show it's processing
      setJobs(prev => prev.map(j => 
        j.name === job.name 
          ? { ...j, jobData: { ...j.jobData, job_status: 'Digital asset creation started...' } }
          : j
      ));
      
      // Refresh job data after a delay
      setTimeout(() => {
        fetchJobDetails(job.name);
      }, 10000);

    } catch (error) {
      console.error('Error starting asset creation:', error);
      alert('Failed to start digital asset creation: ' + (error as Error).message);
    }
  };

  // Preview assets for a job
  const previewAssets = (job: JobFile) => {
    if (!job.jobData) return;
    
    const templateName = job.jobData.template || 'Unknown';
    const cleanTemplateName = templateName.replace('.json', '');
    
    router.push({
      pathname: `/${cleanTemplateName}/preview-assets`,
      query: {
        jobData: JSON.stringify(job.jobData)
      }
    });
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const getJobDisplayName = (jobName: string) => {
    return jobName.split('/').pop()?.replace('.json', '') || jobName;
  };

  const getStatusColor = (status: string) => {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('succeed') || lowerStatus.includes('completed')) return '#10b981';
    if (lowerStatus.includes('fail') || lowerStatus.includes('error')) return '#ef4444';
    if (lowerStatus.includes('running') || lowerStatus.includes('processing') || lowerStatus.includes('started')) return '#3b82f6';
    return '#9ca3af';
  };

  const getActionButtonText = (status: string) => {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('upload completed')) return 'Start PDF Extraction';
    if (lowerStatus.includes('extraction completed')) return 'Create Digital Assets';
    if (lowerStatus.includes('digital assets completed') || lowerStatus.includes('digital assets succeeded')) return 'Preview Assets';
    return 'View Processing';
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
              🔄 Refresh
            </button>
          </div>

          {jobs.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '48px 0',
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: 12,
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <p style={{ color: '#9ca3af', fontSize: 18 }}>No jobs found</p>
              <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>
                Jobs will appear here after you upload PDFs for processing
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {jobs.map((job) => (
                <div
                  key={job.name}
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
                      <h3 style={{ 
                        fontSize: '1.2rem', 
                        fontWeight: 600, 
                        color: '#f8f8f8',
                        marginBottom: 8
                      }}>
                        {getJobDisplayName(job.name)}
                      </h3>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                        {job.lastModified && (
                          <span style={{ color: '#9ca3af', fontSize: 14 }}>
                            📅 {new Date(job.lastModified).toLocaleString()}
                          </span>
                        )}
                        {job.jobData?.job_status && (
                          <span style={{ 
                            color: getStatusColor(job.jobData.job_status),
                            fontSize: 14,
                            fontWeight: 600,
                            padding: '4px 8px',
                            background: `${getStatusColor(job.jobData.job_status)}20`,
                            borderRadius: 6,
                            border: `1px solid ${getStatusColor(job.jobData.job_status)}40`
                          }}>
                            🔄 {job.jobData.job_status}
                          </span>
                        )}
                        {job.jobData?.source_folder && (
                          <span style={{ color: '#9ca3af', fontSize: 12 }}>
                            📁 {job.jobData.source_folder.split('/').pop()}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {job.loading && <Spinner />}
                      
                      {job.jobData && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const status = job.jobData.job_status?.toLowerCase() || '';
                            if (status.includes('digital assets completed') || status.includes('digital assets succeeded')) {
                              previewAssets(job);
                            } else if (status.includes('upload completed') || status.includes('extraction completed')) {
                              executeJobAction(job);
                            } else {
                              viewJobProcessing(job);
                            }
                          }}
                          style={{
                            padding: '8px 16px',
                            background: job.jobData.job_status?.toLowerCase().includes('digital assets completed') || 
                                       job.jobData.job_status?.toLowerCase().includes('digital assets succeeded')
                              ? 'linear-gradient(135deg, #10b981, #059669)'
                              : job.jobData.job_status?.toLowerCase().includes('upload completed') ||
                                job.jobData.job_status?.toLowerCase().includes('extraction completed')
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
                          {job.jobData.job_status ? getActionButtonText(job.jobData.job_status) : 'View Processing'}
                        </button>
                      )}
                      
                      <span 
                        style={{ 
                          fontSize: 18, 
                          color: '#9ca3af',
                          transform: expandedJob === job.name ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                          cursor: 'pointer'
                        }}
                        onClick={() => toggleJobExpansion(job.name)}
                      >
                        ▼
                      </span>
                    </div>
                  </div>

                  {expandedJob === job.name && job.jobData && (
                    <div style={{ 
                      marginTop: 20, 
                      padding: 16,
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: 8,
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        {job.jobData.job_id && (
                          <div>
                            <strong style={{ color: '#e0e0e0' }}>Job ID:</strong>
                            <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 4 }}>{job.jobData.job_id}</p>
                          </div>
                        )}
                        {job.jobData.source_folder && (
                          <div>
                            <strong style={{ color: '#e0e0e0' }}>Source Folder:</strong>
                            <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 4, wordBreak: 'break-all' }}>
                              {job.jobData.source_folder}
                            </p>
                          </div>
                        )}
                        {job.jobData.template && (
                          <div>
                            <strong style={{ color: '#e0e0e0' }}>Template:</strong>
                            <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 4 }}>{job.jobData.template}</p>
                          </div>
                        )}
                        {job.jobData.total_files && (
                          <div>
                            <strong style={{ color: '#e0e0e0' }}>Total Files:</strong>
                            <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 4 }}>{job.jobData.total_files}</p>
                          </div>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            viewJobProcessing(job);
                          }}
                          style={{
                            padding: '8px 16px',
                            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 600
                          }}
                        >
                          View Processing
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(JSON.stringify(job.jobData, null, 2));
                          }}
                          style={{
                            padding: '8px 16px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: '#e0e0e0',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 14
                          }}
                        >
                          Copy JSON
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 