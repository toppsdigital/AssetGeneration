'use client';

import { useState } from 'react';
import { useDownloadArchive } from '../web/hooks/useJobData';
import { ConfirmationModal } from './ConfirmationModal';

interface DownloadSectionProps {
  jobData: any;
  isVisible: boolean;
  onRegenerateAssets?: () => Promise<void>;
}

export const DownloadSection = ({ jobData, isVisible, onRegenerateAssets }: DownloadSectionProps) => {
  // Use React Query hook for smart caching with expiry management
  const { 
    data: archiveData, 
    isLoading: loadingArchive, 
    error: downloadError,
    refetch: refetchArchive
  } = useDownloadArchive(jobData?.job_id || null, isVisible);

  // Local state only for download progress
  const [downloadingArchive, setDownloadingArchive] = useState(false);
  const [regeneratingAssets, setRegeneratingAssets] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);

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

  const handleRegenerateClick = () => {
    setShowRegenerateModal(true);
  };

  const handleConfirmRegenerate = async () => {
    if (!onRegenerateAssets) return;
    
    setRegeneratingAssets(true);
    
    try {
      await onRegenerateAssets();
      setShowRegenerateModal(false);
    } catch (error) {
      console.error('❌ Error regenerating assets:', error);
      alert(`Failed to regenerate assets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRegeneratingAssets(false);
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
          <div style={{ opacity: 0.8 }}>{downloadError instanceof Error ? downloadError.message : String(downloadError)}</div>
          <button
            onClick={() => refetchArchive()}
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
              disabled={downloadingArchive || regeneratingAssets}
              style={{
                padding: '20px 40px',
                background: (downloadingArchive || regeneratingAssets)
                  ? 'rgba(156, 163, 175, 0.3)'
                  : 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                borderRadius: 16,
                color: 'white',
                fontSize: 18,
                fontWeight: 700,
                cursor: (downloadingArchive || regeneratingAssets) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: (downloadingArchive || regeneratingAssets)
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

          {/* Re-Generate Assets Button */}
          {onRegenerateAssets && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 12
            }}>
              <button
                onClick={handleRegenerateClick}
                disabled={downloadingArchive || regeneratingAssets}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: regeneratingAssets
                    ? '1px solid rgba(156, 163, 175, 0.3)'
                    : '1px solid rgba(168, 85, 247, 0.3)',
                  borderRadius: 8,
                  color: regeneratingAssets ? '#9ca3af' : '#c4b5fd',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: (downloadingArchive || regeneratingAssets) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  opacity: regeneratingAssets ? 0.6 : 0.8
                }}
                onMouseEnter={(e) => {
                  if (!downloadingArchive && !regeneratingAssets) {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!downloadingArchive && !regeneratingAssets) {
                    e.currentTarget.style.opacity = '0.8';
                    e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
                  }
                }}
              >
                {regeneratingAssets ? (
                  <>
                    <div style={{
                      width: 14,
                      height: 14,
                      border: '1px solid rgba(156, 163, 175, 0.5)',
                      borderTop: '1px solid #9ca3af',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 14 }}>🔄</span>
                    Re-Generate Assets
                  </>
                )}
              </button>
            </div>
          )}

          {/* Additional Info */}
          <div style={{
            textAlign: 'center',
            fontSize: 12,
            color: '#9ca3af',
            marginTop: -8
          }}>
            Archive contains all generated digital assets from this job • Expires in {formatExpirationTime(archiveData.expires_in)}
            {onRegenerateAssets && (
              <>
                <br />
                <span style={{ fontSize: 11, opacity: 0.8 }}>
                  Need different assets? Re-generate to go back to template selection
                </span>
              </>
            )}
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

      {/* Re-generate Confirmation Modal */}
      <ConfirmationModal
        isOpen={showRegenerateModal}
        onClose={() => setShowRegenerateModal(false)}
        onConfirm={handleConfirmRegenerate}
        title="Re-Generate Assets"
        message="Are you sure you want to re-generate assets? This will reset the job status to 'extracted' and allow you to select a different template and generate new assets."
        confirmText="Yes, Re-Generate"
        cancelText="Cancel"
        confirmButtonStyle="primary"
        isLoading={regeneratingAssets}
      />
    </div>
  );
}; 