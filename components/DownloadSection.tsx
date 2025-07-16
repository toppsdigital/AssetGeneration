'use client';

import { useState, useEffect } from 'react';
import { contentPipelineApi } from '../web/utils/contentPipelineApi';

interface DownloadArchive {
  download_url: string;
  expires_in: number;
  zip_key: string;
  source_folder: string;
  files_count: number;
}

interface DownloadSectionProps {
  jobData: any;
  isVisible: boolean;
}

export const DownloadSection = ({ jobData, isVisible }: DownloadSectionProps) => {
  // State management
  const [archiveData, setArchiveData] = useState<DownloadArchive | null>(null);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingArchive, setDownloadingArchive] = useState(false);

  // Fetch download archive when component becomes visible
  useEffect(() => {
    if (isVisible && jobData?.job_id) {
      fetchDownloadArchive();
    }
  }, [isVisible, jobData?.job_id]);

  const fetchDownloadArchive = async () => {
    if (!jobData?.job_id) return;
    
    try {
      setLoadingArchive(true);
      setDownloadError(null);
      
      console.log('🔍 Creating download archive for job:', jobData.job_id);
      
      const response = await contentPipelineApi.downloadJobOutputFolder(jobData.job_id);
      
      console.log('📁 Download archive response:', response);
      
      if (response.success && response.data) {
        setArchiveData(response.data);
      } else {
        setDownloadError(response.message || 'No files found for download');
        setArchiveData(null);
      }
      
    } catch (error) {
      console.error('❌ Error creating download archive:', error);
      setDownloadError(error instanceof Error ? error.message : 'Failed to create download archive');
      setArchiveData(null);
    } finally {
      setLoadingArchive(false);
    }
  };

  const handleDownloadArchive = async () => {
    if (!archiveData) return;
    
    setDownloadingArchive(true);
    
    try {
      // Create a temporary link element and trigger download
      const link = document.createElement('a');
      link.href = archiveData.download_url;
      link.download = `job_${jobData.job_id}_assets.zip`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log(`✅ Initiated download for archive with ${archiveData.files_count} files`);
      
    } catch (error) {
      console.error('❌ Error downloading archive:', error);
      alert(`Failed to download archive: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDownloadingArchive(false);
    }
  };

  const formatExpirationTime = (expiresIn: number) => {
    const hours = Math.floor(expiresIn / 3600);
    const minutes = Math.floor((expiresIn % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (!isVisible) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.15))',
      border: '2px solid rgba(16, 185, 129, 0.3)',
      borderRadius: 16,
      padding: 24,
      marginBottom: 32,
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 16
      }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #10b981, #059669)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          flexShrink: 0
        }}>
          📦
        </div>
        <div>
          <h2 style={{
            fontSize: '1.4rem',
            fontWeight: 700,
            color: '#f8f8f8',
            margin: '0 0 8px 0'
          }}>
            🎉 Job Complete: Download Your Assets
          </h2>
          <p style={{
            fontSize: '1rem',
            color: '#a7f3d0',
            margin: 0,
            lineHeight: 1.5
          }}>
            Download your completed files as a zip archive below.
          </p>
        </div>
      </div>

      {/* Loading State */}
      {loadingArchive && (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: 12,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          margin: '20px 0'
        }}>
          <div style={{
            width: 32,
            height: 32,
            border: '3px solid rgba(16, 185, 129, 0.3)',
            borderTop: '3px solid #10b981',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <div style={{
            color: '#9ca3af',
            fontSize: 14,
            marginBottom: 8
          }}>
            Creating download archive...
          </div>
          <div style={{
            color: '#6b7280',
            fontSize: 12
          }}>
            Compressing all your generated assets into a ZIP file
          </div>
        </div>
      )}

      {/* Error State */}
      {downloadError && !loadingArchive && (
        <div style={{
          padding: '16px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 8,
          color: '#fca5a5',
          fontSize: 14,
          margin: '20px 0'
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Unable to create download archive</div>
          <div style={{ opacity: 0.8 }}>{downloadError}</div>
          <button
            onClick={fetchDownloadArchive}
            style={{
              marginTop: 8,
              padding: '6px 12px',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 4,
              color: '#fca5a5',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Archive Available */}
      {archiveData && !loadingArchive && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Download Button */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            marginTop: 8
          }}>
            <button
              onClick={handleDownloadArchive}
              disabled={downloadingArchive}
              style={{
                padding: '20px 40px',
                background: downloadingArchive
                  ? 'rgba(156, 163, 175, 0.3)'
                  : 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                borderRadius: 16,
                color: 'white',
                fontSize: 18,
                fontWeight: 700,
                cursor: downloadingArchive ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: downloadingArchive
                  ? 'none' 
                  : '0 12px 32px rgba(16, 185, 129, 0.4)',
                minHeight: 70,
                minWidth: 250,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12
              }}
            >
              {downloadingArchive ? (
                <>
                  <div style={{
                    width: 20,
                    height: 20,
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTop: '2px solid white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  Downloading...
                </>
              ) : (
                <>
                  <span style={{ fontSize: 24 }}>📦</span>
                  Download ZIP Archive ({archiveData.files_count} files)
                </>
              )}
            </button>
          </div>

          {/* Additional Info */}
          <div style={{
            textAlign: 'center',
            fontSize: 12,
            color: '#9ca3af',
            marginTop: -8
          }}>
            Archive contains all generated digital assets from this job • Expires in {formatExpirationTime(archiveData.expires_in)}
          </div>
        </div>
      )}

      {/* No Archive Available */}
      {!archiveData && !loadingArchive && !downloadError && (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: 12,
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{
            fontSize: 48,
            marginBottom: 16
          }}>
            📂
          </div>
          <div style={{
            fontSize: 16,
            color: '#f8f8f8',
            fontWeight: 600,
            marginBottom: 8
          }}>
            No download archive available
          </div>
          <div style={{
            fontSize: 14,
            color: '#9ca3af'
          }}>
            Files may still be processing or there was an issue with asset generation.
          </div>
        </div>
      )}

      {/* Add required CSS animations */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}; 