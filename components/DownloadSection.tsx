'use client';

import { useState, useEffect } from 'react';
import { ConfirmationModal } from './ConfirmationModal';
import { contentPipelineApi } from '../web/utils/contentPipelineApi';
import { useQueryClient } from '@tanstack/react-query';
import { jobKeys } from '../web/hooks/useJobData';

interface DownloadSectionProps {
  jobData: any;
  isVisible: boolean;
  onJobDataUpdate?: (updatedJobData: any) => void; // Callback to update parent component's job data
}

export const DownloadSection = ({ jobData, isVisible, onJobDataUpdate }: DownloadSectionProps) => {
  const queryClient = useQueryClient();
  
  // Check if job object has a valid download URL that hasn't expired
  const hasValidDownloadUrl = () => {
    if (!jobData?.download_url || !jobData?.download_url_expires) {
      return false;
    }
    
    const expiryTime = new Date(jobData.download_url_expires).getTime();
    const now = Date.now();
    
    // Consider valid if not expired (no buffer here, just check actual expiry)
    return expiryTime > now;
  };

  // Check if download URL needs refresh (expired or expiring soon)
  const needsRefresh = () => {
    if (!jobData?.download_url || !jobData?.download_url_expires) {
      return false;
    }
    
    const expiryTime = new Date(jobData.download_url_expires).getTime();
    const now = Date.now();
    const fiveMinutesFromNow = now + (5 * 60 * 1000);
    
    return expiryTime <= fiveMinutesFromNow;
  };

  // Local state for download management
  const [downloadingArchive, setDownloadingArchive] = useState(false);
  const [regeneratingAssets, setRegeneratingAssets] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [refreshingDownloadUrl, setRefreshingDownloadUrl] = useState(false);
  const [creatingDownloadUrl, setCreatingDownloadUrl] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Function to refresh download URL when expired
  const refreshDownloadUrl = async () => {
    if (!jobData?.job_id || refreshingDownloadUrl) return;
    
    console.log('🔄 Download URL expired, generating new one for job:', jobData.job_id);
    setRefreshingDownloadUrl(true);
    
    try {
      const response = await contentPipelineApi.updateDownloadUrl(jobData.job_id);
      
      if (response.success && response.download_url && response.download_url_expires) {
        console.log('✅ New download URL generated and saved:', response.download_url);
        
        // Update the job data with new download URL
        const updatedJobData = {
          ...jobData,
          download_url: response.download_url,
          download_url_expires: response.download_url_expires,
          download_url_created: new Date().toISOString()
        };
        
        // Notify parent component to update its job data
        if (onJobDataUpdate) {
          onJobDataUpdate(updatedJobData);
        }
      } else {
        console.error('❌ Failed to generate new download URL:', response.message);
      }
    } catch (error) {
      console.error('❌ Error refreshing download URL:', error);
    } finally {
      setRefreshingDownloadUrl(false);
    }
  };

  // Function to create download URL on user action
  const createDownloadUrl = async () => {
    if (!jobData?.job_id || creatingDownloadUrl) return null;
    
    console.log('🔄 Creating and saving download URL for job:', jobData.job_id);
    setCreatingDownloadUrl(true);
    setDownloadError(null);
    
    try {
      // Use updateDownloadUrl which generates AND saves the URL to the job object
      const response = await contentPipelineApi.updateDownloadUrl(jobData.job_id);
      
      if (response.success && response.download_url && response.download_url_expires) {
        console.log('✅ Download URL created and saved to job object:', response.download_url);
        
        // Update the job data with the new download URL info
        const updatedJobData = {
          ...jobData,
          download_url: response.download_url,
          download_url_expires: response.download_url_expires,
          download_url_created: new Date().toISOString()
        };
        
        // Notify parent component to update its job data
        if (onJobDataUpdate) {
          onJobDataUpdate(updatedJobData);
        }
        
        return response.download_url;
      } else {
        throw new Error(response.message || 'Failed to create download URL');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error creating download URL:', errorMessage);
      setDownloadError(errorMessage);
      return null;
    } finally {
      setCreatingDownloadUrl(false);
    }
  };

  const handleDownloadArchive = async () => {
    let downloadUrl: string;
    let downloadSource: string;
    
    // Use download URL from job object if available and valid
    if (hasValidDownloadUrl()) {
      downloadUrl = jobData.download_url;
      downloadSource = 'stored URL';
      console.log('🔗 Using download URL from job object');
    } else if (needsRefresh() && jobData.download_url) {
      // URL exists but expired, refresh it
      console.log('🔄 Download URL expired, refreshing...');
      await refreshDownloadUrl();
      if (hasValidDownloadUrl()) {
        downloadUrl = jobData.download_url;
        downloadSource = 'refreshed URL';
      } else {
        // Refresh failed, create new URL
        downloadUrl = await createDownloadUrl();
        if (!downloadUrl) return;
        downloadSource = 'newly created URL';
      }
    } else {
      // No URL available, create one
      downloadUrl = await createDownloadUrl();
      if (!downloadUrl) return;
      downloadSource = 'newly created URL';
    }
    
    setDownloadingArchive(true);
    
    try {
      // Create a temporary link element and trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `job_${jobData.job_id}_assets.zip`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log(`✅ Initiated download from ${downloadSource} for job ${jobData.job_id}`);
      
    } catch (error) {
      console.error('❌ Error downloading archive:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setDownloadError(`Failed to download archive: ${errorMessage}`);
    } finally {
      setDownloadingArchive(false);
    }
  };

  const handleRegenerateClick = () => {
    setShowRegenerateModal(true);
  };

  const handleConfirmRegenerate = async () => {
    if (!jobData?.job_id) return;
    
    setRegeneratingAssets(true);
    
    try {
      console.log('🔄 Calling regenerate assets endpoint for job:', jobData.job_id);
      
      // Call the regenerate API endpoint
      const response = await contentPipelineApi.regenerateAssets(jobData.job_id);
      
      console.log('✅ Assets regeneration successful:', response);
      
      // If the response contains an updated job object, use it immediately
      if (response.success && response.job) {
        console.log('🔄 Updating job data with regenerated job object:', response.job);
        
        // Update the parent component with the new job data
        if (onJobDataUpdate) {
          onJobDataUpdate(response.job);
        }
        
        // Update React Query cache with the new job data
        queryClient.setQueryData(jobKeys.detail(jobData.job_id), {
          job: response.job
        });
      }
      
      // Also invalidate related caches to ensure consistency
      queryClient.removeQueries({ queryKey: jobKeys.files(jobData.job_id) });
      queryClient.removeQueries({ queryKey: jobKeys.all });
      queryClient.invalidateQueries({ queryKey: jobKeys.files(jobData.job_id) });
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
      
      setShowRegenerateModal(false);
      
      console.log('✅ Assets regeneration completed - job data updated and caches refreshed');
    } catch (error) {
      console.error('❌ Error regenerating assets:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Full error details:', {
        message: errorMessage,
        error: error,
        jobId: jobData.job_id
      });
      alert(`Failed to regenerate assets: ${errorMessage}`);
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

  // Get expiration info for display
  const getExpirationInfo = () => {
    if (hasValidDownloadUrl()) {
      const expiryTime = new Date(jobData.download_url_expires).getTime();
      const now = Date.now();
      const expiresInSeconds = Math.floor((expiryTime - now) / 1000);
      return {
        expiresIn: expiresInSeconds,
        source: 'stored'
      };
    }
    return null;
  };

  if (!isVisible || jobData?.job_status !== 'completed') return null;

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

      {/* Error State */}
      {downloadError && (
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
            onClick={() => setDownloadError(null)}
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
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content */}
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
            disabled={downloadingArchive || regeneratingAssets || refreshingDownloadUrl || creatingDownloadUrl}
            style={{
              padding: '20px 40px',
              background: (downloadingArchive || regeneratingAssets || refreshingDownloadUrl || creatingDownloadUrl)
                ? 'rgba(156, 163, 175, 0.3)'
                : 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              borderRadius: 16,
              color: 'white',
              fontSize: 18,
              fontWeight: 700,
              cursor: (downloadingArchive || regeneratingAssets || refreshingDownloadUrl || creatingDownloadUrl) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: (downloadingArchive || regeneratingAssets || refreshingDownloadUrl || creatingDownloadUrl)
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
            {creatingDownloadUrl ? (
              <>
                <div style={{
                  width: 20,
                  height: 20,
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                Creating Download Link...
              </>
            ) : refreshingDownloadUrl ? (
              <>
                <div style={{
                  width: 20,
                  height: 20,
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                Refreshing Download Link...
              </>
            ) : downloadingArchive ? (
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
                {hasValidDownloadUrl() ? 'Download ZIP Archive (Ready)' : 'Create & Download ZIP Archive'}
              </>
            )}
          </button>
        </div>

        {/* Re-Generate Assets Button - Always visible for completed jobs */}
        {jobData?.job_id && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 12
          }}>
            <button
              onClick={handleRegenerateClick}
              disabled={downloadingArchive || regeneratingAssets || refreshingDownloadUrl || creatingDownloadUrl}
              style={{
                padding: '12px 24px',
                background: 'transparent',
                border: (regeneratingAssets || refreshingDownloadUrl || creatingDownloadUrl)
                  ? '1px solid rgba(156, 163, 175, 0.3)'
                  : '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: 8,
                color: (regeneratingAssets || refreshingDownloadUrl || creatingDownloadUrl) ? '#9ca3af' : '#c4b5fd',
                fontSize: 16,
                fontWeight: 500,
                cursor: (downloadingArchive || regeneratingAssets || refreshingDownloadUrl || creatingDownloadUrl) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                opacity: (regeneratingAssets || refreshingDownloadUrl || creatingDownloadUrl) ? 0.6 : 0.9,
                minHeight: 50
              }}
              onMouseEnter={(e) => {
                if (!downloadingArchive && !regeneratingAssets && !refreshingDownloadUrl && !creatingDownloadUrl) {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.5)';
                  e.currentTarget.style.background = 'rgba(168, 85, 247, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!downloadingArchive && !regeneratingAssets && !refreshingDownloadUrl && !creatingDownloadUrl) {
                  e.currentTarget.style.opacity = '0.9';
                  e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {regeneratingAssets ? (
                <>
                  <div style={{
                    width: 16,
                    height: 16,
                    border: '2px solid rgba(156, 163, 175, 0.5)',
                    borderTop: '2px solid #9ca3af',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  Regenerating...
                </>
              ) : (
                <>
                  <span style={{ fontSize: 16 }}>🔄</span>
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
          {(() => {
            const expirationInfo = getExpirationInfo();
            if (expirationInfo) {
              return `Download archive will contain all generated digital assets • Current link expires in ${formatExpirationTime(expirationInfo.expiresIn)}`;
            }
            return 'Download archive will contain all generated digital assets from this job';
          })()}
          {jobData?.job_id && (
            <>
              <br />
              <span style={{ fontSize: 11, opacity: 0.8 }}>
                Need different assets? Use Re-Generate to go back to template selection
              </span>
            </>
          )}
        </div>
      </div>

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