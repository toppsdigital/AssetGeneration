'use client';

import { useState, useEffect } from 'react';
import { useAppDataStore } from '../hooks/useAppDataStore';

interface ExtractedDownloadSectionProps {
  jobData: any;
  isVisible: boolean;
  onJobDataUpdate?: (updatedJobData: any) => void;
}

export const ExtractedDownloadSection = ({ jobData, isVisible, onJobDataUpdate }: ExtractedDownloadSectionProps) => {
  // Track if we should be polling for extracted download URL updates
  const [shouldPoll, setShouldPoll] = useState(() => jobData?.extracted_download_url === 'pending');

  // Use centralized data store for job polling when extracted_download_url is pending
  const { data: polledJobData, mutate, isAutoRefreshActive } = useAppDataStore('jobDetails', {
    jobId: jobData?.job_id || '',
    autoRefresh: shouldPoll,
    includeFiles: false,
    includeAssets: false
  });

  const currentJobData = polledJobData || jobData;

  useEffect(() => {
    console.log(`🔍 [ExtractedDownloadSection] Polling debug:`, {
      jobId: jobData?.job_id,
      shouldPoll,
      isAutoRefreshActive,
      extracted_download_url: currentJobData?.extracted_download_url,
      extracted_zip_status: currentJobData?.extracted_zip_status,
      hasPolledData: !!polledJobData
    });
  }, [shouldPoll, isAutoRefreshActive, currentJobData?.extracted_download_url, currentJobData?.extracted_zip_status, jobData?.job_id, polledJobData]);

  const hasValidExtractedUrl = () => {
    if (!currentJobData?.extracted_download_url || currentJobData.extracted_download_url === 'pending') return false;
    if (!currentJobData.extracted_download_url_expires) return true;
    const expiryTime = new Date(currentJobData.extracted_download_url_expires).getTime();
    return expiryTime > Date.now();
  };

  const isExtractedPending = () => currentJobData?.extracted_download_url === 'pending';
  const isCreating = () => currentJobData?.extracted_zip_status === 'creating';

  useEffect(() => {
    const pending = isExtractedPending() || isCreating();
    const valid = hasValidExtractedUrl();
    const shouldStop = valid && currentJobData?.extracted_zip_status === 'zip_ready';

    if (pending && !shouldPoll) setShouldPoll(true);
    else if (shouldStop && shouldPoll) setShouldPoll(false);
  }, [currentJobData?.extracted_download_url, currentJobData?.extracted_zip_status, shouldPoll]);

  const [downloading, setDownloading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update parent with polled data (preserve files)
  useEffect(() => {
    if (polledJobData && onJobDataUpdate && jobData) {
      const merged = {
        ...jobData,
        ...polledJobData,
        content_pipeline_files: polledJobData.content_pipeline_files || jobData.content_pipeline_files,
        api_files: polledJobData.api_files || jobData.api_files,
        files: polledJobData.files || jobData.files
      };
      onJobDataUpdate(merged);
    }
  }, [polledJobData, onJobDataUpdate, jobData]);

  const createExtractedZip = async () => {
    if (!currentJobData?.job_id || creating) return;
    setCreating(true);
    setError(null);
    try {
      const response = await mutate({
        type: 'createExtractedZip',
        jobId: currentJobData.job_id
      });
      console.log('✅ Extracted ZIP creation response:', response);
      setShouldPoll(true);

      if (response?.job && onJobDataUpdate) {
        const updated = {
          ...currentJobData,
          extracted_download_url: response.job.extracted_download_url,
          extracted_download_url_expires: response.job.extracted_download_url_expires,
          extracted_zip_status: response.job.extracted_zip_status,
          last_updated: response.job.last_updated || new Date().toISOString()
        };
        onJobDataUpdate(updated);
      }
    } catch (e: any) {
      const msg = e?.message || 'Unknown error';
      console.error('❌ Error creating extracted ZIP:', msg);
      setError(`Failed to create extracted ZIP: ${msg}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async () => {
    if (!hasValidExtractedUrl()) return;
    setDownloading(true);
    try {
      const link = document.createElement('a');
      link.href = currentJobData.extracted_download_url;
      link.download = `job_${currentJobData.job_id}_extracted.zip`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(`Failed to download extracted ZIP: ${msg}`);
    } finally {
      setDownloading(false);
    }
  };

  const onPrimaryClick = async () => {
    if (hasValidExtractedUrl()) await handleDownload();
    else await createExtractedZip();
  };

  const getExpirationInfo = () => {
    if (hasValidExtractedUrl() && currentJobData.extracted_download_url_expires) {
      const expiry = new Date(currentJobData.extracted_download_url_expires).getTime();
      return Math.floor((expiry - Date.now()) / 1000);
    }
    return null;
  };

  if (!isVisible || (currentJobData?.job_status || '').toLowerCase() !== 'extracted') return null;

  const disabled = downloading || creating || isExtractedPending() || isCreating();

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(79, 70, 229, 0.15))',
      border: '2px solid rgba(99, 102, 241, 0.3)',
      borderRadius: 16,
      padding: 24,
      marginTop: 24,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          flexShrink: 0
        }}>🗂️</div>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8f8f8', margin: '0 0 6px 0' }}>
            Download Extracted Files ZIP
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#c7d2fe', margin: 0, lineHeight: 1.5 }}>
            Get a ZIP of all extracted files produced during PDF extraction.
          </p>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 8,
          color: '#fca5a5',
          fontSize: 14,
          margin: '16px 0'
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Unable to create extracted archive</div>
          <div style={{ opacity: 0.8 }}>{error}</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        <button
          onClick={onPrimaryClick}
          disabled={disabled}
          style={{
            padding: '16px 32px',
            background: disabled ? 'rgba(156, 163, 175, 0.3)' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
            border: 'none',
            borderRadius: 12,
            color: 'white',
            fontSize: 16,
            fontWeight: 700,
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            minHeight: 56,
            minWidth: 240,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10
          }}
        >
          {creating || isCreating() ? (
            <>
              <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              Creating Download Link...
            </>
          ) : isExtractedPending() ? (
            <>
              <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              Awaiting Download URL...
            </>
          ) : downloading ? (
            <>
              <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              Downloading...
            </>
          ) : (
            <>
              <span style={{ fontSize: 20 }}>🗂️</span>
              {hasValidExtractedUrl() ? 'Download Extracted Files ZIP' : 'Create Extracted Download Link'}
            </>
          )}
        </button>

        <div style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: -4 }}>
          {isCreating() || isExtractedPending() ? 'Creating extracted files archive... This may take a few minutes' :
            (() => {
              const seconds = getExpirationInfo();
              if (seconds && seconds > 0) {
                const h = Math.floor(seconds / 3600);
                const m = Math.floor((seconds % 3600) / 60);
                const fmt = h > 0 ? `${h}h ${m}m` : `${m}m`;
                return `Link expires in ${fmt}`;
              }
              return 'ZIP will include all extracted files produced from the PDFs';
            })()
          }
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};


