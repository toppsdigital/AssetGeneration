'use client';

import { useState, useEffect } from 'react';
import { ConfirmationModal } from './ConfirmationModal';
import { useAppDataStore } from '../hooks/useAppDataStore';
import { getS3Environment } from '../utils/environment';

interface DownloadSectionProps {
  jobData: any;
  isVisible: boolean;
  onJobDataUpdate?: (updatedJobData: any) => void; // Callback to update parent component's job data
}

export const DownloadSection = ({ jobData, isVisible, onJobDataUpdate }: DownloadSectionProps) => {
  // Track if we should be polling for download URL updates
  const [shouldPoll, setShouldPoll] = useState(() => {
    // Initialize polling if job already has pending download_url
    return jobData?.download_url === 'pending';
  });
  
  // Use centralized data store for job polling when download_url is pending
  // Don't include files to avoid impacting the files section
  const { data: polledJobData, mutate, isAutoRefreshActive } = useAppDataStore('jobDetails', { 
    jobId: jobData?.job_id || '',
    autoRefresh: shouldPoll,
    includeFiles: false, // Don't fetch files to avoid affecting files display
    includeAssets: false // Don't fetch assets to keep it lightweight
  });
  
  // Use polled data if available, otherwise fall back to prop data
  const currentJobData = polledJobData || jobData;
  
  
  // Debug logging for polling state
  useEffect(() => {
    console.log(`🔍 [DownloadSection] Polling state debug:`, {
      jobId: jobData?.job_id,
      shouldPoll,
      isAutoRefreshActive,
      download_url: currentJobData?.download_url,
      job_status: currentJobData?.job_status,
      hasPolledData: !!polledJobData
    });
  }, [shouldPoll, isAutoRefreshActive, currentJobData?.download_url, currentJobData?.job_status, jobData?.job_id, polledJobData]);
  
  // Check if job has a valid download URL (not pending and not expired)
  const hasValidDownloadUrl = () => {
    if (!currentJobData?.download_url || currentJobData.download_url === 'pending') {
      return false;
    }
    
    // If no expiry date, assume it's valid
    if (!currentJobData.download_url_expires) {
      return true;
    }
    
    const expiryTime = new Date(currentJobData.download_url_expires).getTime();
    const now = Date.now();
    
    return expiryTime > now;
  };
  
  // Check if download URL is pending
  const isDownloadPending = () => {
    return currentJobData?.download_url === 'pending';
  };
  
  // Update polling state based on current job data
  useEffect(() => {
    const isPending = currentJobData?.download_url === 'pending';
    const hasValidUrl = hasValidDownloadUrl();
    const shouldStopPolling = hasValidUrl || (!isPending && currentJobData?.download_url && currentJobData.download_url !== 'pending');
    
    console.log(`📊 Download URL status check:`, {
      jobId: currentJobData?.job_id,
      download_url: currentJobData?.download_url,
      isPending,
      hasValidUrl,
      shouldPoll,
      shouldStopPolling,
      willStartPolling: isPending && !shouldPoll,
      willStopPolling: shouldStopPolling && shouldPoll
    });
    
    if (isPending && !shouldPoll) {
      console.log(`🔄 Download polling started for job ${currentJobData?.job_id} (download_url is pending)`);
      setShouldPoll(true);
    } else if (shouldStopPolling && shouldPoll) {
      console.log(`✅ Download polling stopped for job ${currentJobData?.job_id} (download_url ready: ${currentJobData?.download_url})`);
      setShouldPoll(false);
    }
  }, [currentJobData?.download_url, currentJobData?.job_id, shouldPoll]);

  // Local state for download management
  const [downloadingArchive, setDownloadingArchive] = useState(false);
  const [regeneratingAssets, setRegeneratingAssets] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [creatingDownloadLink, setCreatingDownloadLink] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  
  // Update parent component when polled data changes (preserve files data)
  useEffect(() => {
    if (polledJobData && onJobDataUpdate && jobData) {
      // Merge polled data with original job data to preserve files
      const mergedJobData = {
        ...jobData, // Preserve original data including files
        ...polledJobData, // Apply polled updates
        // Explicitly preserve files data if missing in polled data
        content_pipeline_files: polledJobData.content_pipeline_files || jobData.content_pipeline_files,
        api_files: polledJobData.api_files || jobData.api_files,
        files: polledJobData.files || jobData.files
      };
      
      onJobDataUpdate(mergedJobData);
    }
  }, [polledJobData, onJobDataUpdate, jobData]);

  // Function to create download ZIP
  const createDownloadZip = async () => {
    if (!currentJobData?.job_id || creatingDownloadLink) return;
    
    // Use the full path format with trailing slash
    const folderPath = `asset_generator/${getS3Environment()}/uploads/Output/${currentJobData.job_id}/`;
    
    console.log('🔄 Creating download ZIP for job:', currentJobData.job_id);
    setCreatingDownloadLink(true);
    setDownloadError(null);
    
    try {
      const response = await mutate({
        type: 'createDownloadZip',
        jobId: currentJobData.job_id,
        data: { folderPath }
      });
      
      console.log('✅ Download ZIP creation response:', response);
      
      // Immediately start polling since createzip was successful
      console.log('🔄 Starting polling for download URL after successful createzip');
      setShouldPoll(true);
      
      // Check if response contains updated job data
      if (response?.job) {
        console.log('📦 Updated job from createzip response:', {
          jobId: response.job.job_id,
          download_url: response.job.download_url,
          download_url_expires: response.job.download_url_expires
        });
        
        // Only update specific download-related fields to preserve files data
        if (onJobDataUpdate && currentJobData) {
          const updatedJobData = {
            ...currentJobData, // Preserve existing data including files
            download_url: response.job.download_url,
            download_url_expires: response.job.download_url_expires,
            download_url_created: response.job.download_url_created || new Date().toISOString(),
            last_updated: response.job.last_updated || new Date().toISOString()
          };
          console.log('🔄 Selectively updating job data to preserve files:', {
            preservedFiles: !!currentJobData.content_pipeline_files,
            filesCount: currentJobData.content_pipeline_files?.length || 0,
            updatedFields: ['download_url', 'download_url_expires', 'download_url_created', 'last_updated']
          });
          onJobDataUpdate(updatedJobData);
        }
      } else {
        console.log('⚠️ No job data in createzip response, but polling is now active');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error creating download ZIP:', {
        error: errorMessage,
        fullError: error,
        jobId: currentJobData.job_id,
        folderPath: folderPath
      });
      setDownloadError(`Failed to create download ZIP: ${errorMessage}`);
    } finally {
      setCreatingDownloadLink(false);
    }
  };

  const handleDownloadAction = async () => {
    if (hasValidDownloadUrl()) {
      // Download the ZIP using existing URL
      await handleDownloadArchive();
    } else {
      // Create download ZIP (will set download_url to 'pending')
      await createDownloadZip();
    }
  };
  
  const handleDownloadArchive = async () => {
    if (!hasValidDownloadUrl()) return;
    
    setDownloadingArchive(true);
    
    try {
      // Create a temporary link element and trigger download
      const link = document.createElement('a');
      link.href = currentJobData.download_url;
      link.download = `job_${currentJobData.job_id}_assets.zip`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log(`✅ Initiated download for job ${currentJobData.job_id}`);
      
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
    if (!currentJobData?.job_id) return;
    
    setRegeneratingAssets(true);
    
    try {
      console.log('🔄 Calling regenerate assets endpoint for job:', currentJobData.job_id);
      
      // Call the regenerate API endpoint via centralized data store
      const response = await mutate({
        type: 'regenerateAssets',
        jobId: currentJobData.job_id
      });
      
      console.log('✅ Assets regeneration successful:', response);
      
      setShowRegenerateModal(false);
      
      console.log('✅ Assets regeneration completed - caches will be automatically refreshed');
    } catch (error) {
      console.error('❌ Error regenerating assets:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Full error details:', {
        message: errorMessage,
        error: error,
        jobId: currentJobData.job_id
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
    if (hasValidDownloadUrl() && currentJobData.download_url_expires) {
      const expiryTime = new Date(currentJobData.download_url_expires).getTime();
      const now = Date.now();
      const expiresInSeconds = Math.floor((expiryTime - now) / 1000);
      return {
        expiresIn: expiresInSeconds,
        source: 'stored'
      };
    }
    return null;
  };

  if (!isVisible || currentJobData?.job_status !== 'completed') return null;

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
            onClick={handleDownloadAction}
            disabled={downloadingArchive || regeneratingAssets || creatingDownloadLink || isDownloadPending()}
            style={{
              padding: '20px 40px',
              background: (downloadingArchive || regeneratingAssets || creatingDownloadLink || isDownloadPending())
                ? 'rgba(156, 163, 175, 0.3)'
                : 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              borderRadius: 16,
              color: 'white',
              fontSize: 18,
              fontWeight: 700,
              cursor: (downloadingArchive || regeneratingAssets || creatingDownloadLink || isDownloadPending()) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: (downloadingArchive || regeneratingAssets || creatingDownloadLink || isDownloadPending())
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
            {creatingDownloadLink ? (
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
            ) : isDownloadPending() ? (
              <>
                <div style={{
                  width: 20,
                  height: 20,
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                Awaiting Download URL...
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
                {hasValidDownloadUrl() ? 'Download ZIP Archive' : 'Create Download Link'}
              </>
            )}
          </button>
        </div>

        {/* Re-Generate Assets Button - Always visible for completed jobs */}
        {currentJobData?.job_id && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 12
          }}>
            <button
              onClick={handleRegenerateClick}
              disabled={downloadingArchive || regeneratingAssets || creatingDownloadLink || isDownloadPending()}
              style={{
                padding: '12px 24px',
                background: 'transparent',
                border: (regeneratingAssets || creatingDownloadLink || isDownloadPending())
                  ? '1px solid rgba(156, 163, 175, 0.3)'
                  : '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: 8,
                color: (regeneratingAssets || creatingDownloadLink || isDownloadPending()) ? '#9ca3af' : '#c4b5fd',
                fontSize: 16,
                fontWeight: 500,
                cursor: (downloadingArchive || regeneratingAssets || creatingDownloadLink || isDownloadPending()) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                opacity: (regeneratingAssets || creatingDownloadLink || isDownloadPending()) ? 0.6 : 0.9,
                minHeight: 50
              }}
              onMouseEnter={(e) => {
                if (!downloadingArchive && !regeneratingAssets && !creatingDownloadLink && !isDownloadPending()) {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.5)';
                  e.currentTarget.style.background = 'rgba(168, 85, 247, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!downloadingArchive && !regeneratingAssets && !creatingDownloadLink && !isDownloadPending()) {
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
            if (isDownloadPending()) {
              return 'Creating download archive... This may take a few minutes';
            }
            const expirationInfo = getExpirationInfo();
            if (expirationInfo) {
              return `Download archive will contain all generated digital assets • Current link expires in ${formatExpirationTime(expirationInfo.expiresIn)}`;
            }
            return 'Download archive will contain all generated digital assets from this job';
          })()}
          {currentJobData?.job_id && (
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