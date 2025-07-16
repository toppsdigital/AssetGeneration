import { JobStatusBadge } from './JobStatusBadge';

interface JobHeaderProps {
  jobData: {
    job_id?: string;
    app_name?: string;
    release_name?: string;
    subset_name?: string;
    Subset_name?: string;
    job_status?: string;
    created_at?: string;
    content_pipeline_files?: any[];
  };
  totalPdfFiles?: number;
  uploadedPdfFiles?: number;
  className?: string;
}

export const JobHeader = ({ 
  jobData, 
  totalPdfFiles = 0, 
  uploadedPdfFiles = 0, 
  className = '' 
}: JobHeaderProps) => {
  const getJobTitle = () => {
    if (!jobData) return 'Loading...';
    const parts = [
      jobData.app_name,
      jobData.release_name,
      jobData.subset_name || jobData.Subset_name
    ].filter(Boolean);
    return parts.join(' - ') || 'Unknown Job';
  };

  return (
    <div 
      className={className}
      style={{ 
        marginBottom: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 16,
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
      }}
    >
      {/* Status Badge */}
      <JobStatusBadge 
        status={jobData.job_status || 'Unknown'}
        totalPdfFiles={totalPdfFiles}
        uploadedPdfFiles={uploadedPdfFiles}
      />
      
      {/* Metadata - Less prominent */}
      <div style={{
        display: 'flex',
        gap: 16,
        fontSize: 12,
        color: '#6b7280'
      }}>
        <span>
          Files: <span style={{ color: '#9ca3af' }}>
            {jobData.content_pipeline_files?.length || 0}
          </span>
        </span>
        {jobData.created_at && (
          <span>
            Created: <span style={{ color: '#9ca3af' }}>
              {new Date(jobData.created_at).toLocaleDateString()}
            </span>
          </span>
        )}
        {jobData.job_id && (
          <span>
            ID: <span style={{ 
              color: '#9ca3af', 
              fontFamily: 'monospace', 
              fontSize: 11 
            }}>
              {jobData.job_id}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}; 