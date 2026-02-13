'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../../styles/Home.module.css';
import PageTitle from '../../components/PageTitle';
import Spinner from '../../components/Spinner';
import { contentPipelineApi } from '../../web/utils/contentPipelineApi';

export default function PendingJobsPage() {
  const router = useRouter();
  const [subsets, setSubsets] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingSubset, setProcessingSubset] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const subsetNames = await contentPipelineApi.listNotProcessedSubsets();
        if (!isMounted) return;
        setSubsets(subsetNames);
      } catch (e) {
        if (!isMounted) return;
        setError(e instanceof Error ? e.message : 'Failed to load pending subsets');
      } finally {
        if (!isMounted) return;
        setIsLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const sortedSubsets = useMemo(() => {
    return [...subsets].sort((a, b) => a.localeCompare(b));
  }, [subsets]);

  const handleProcess = async (subsetName: string) => {
    setProcessingSubset(subsetName);
    try {
      const urls = await contentPipelineApi.getSubsetPresignedUrls(subsetName);

      if (!urls || urls.length === 0) {
        alert(`No files found for subset: ${subsetName}`);
        return;
      }

      // Store presigned URLs in sessionStorage to avoid huge query strings.
      const presignKey = `presign_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem(
        presignKey,
        JSON.stringify({
          subset: subsetName,
          presigned_urls: urls,
        })
      );

      // Clear loading state before navigation to avoid setState-on-unmount warnings
      setProcessingSubset(null);
      router.push(
        `/new-job?pendingSubset=${encodeURIComponent(subsetName)}&presignKey=${encodeURIComponent(presignKey)}`
      );
    } catch (e) {
      alert(`Failed to fetch presigned URLs: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setProcessingSubset(prev => (prev === subsetName ? null : prev));
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const subsetNames = await contentPipelineApi.listNotProcessedSubsets();
      setSubsets(subsetNames);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pending subsets');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <PageTitle title="Pending Jobs" leftButton="home" />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <Spinner />
            <p style={{ marginTop: 16, color: '#e0e0e0' }}>Loading pending subsets...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <PageTitle title="Pending Jobs" leftButton="home" />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <h2 style={{ color: '#ef4444', marginBottom: 16 }}>❌ Error Loading Pending Jobs</h2>
            <p style={{ color: '#e0e0e0', marginBottom: 24 }}>{error}</p>
            <button
              onClick={handleRefresh}
              style={{
                padding: '12px 24px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 16,
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
      <PageTitle title="Pending Jobs" leftButton="home" />
      <div className={styles.content}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <p style={{ margin: 0, color: '#9ca3af', fontSize: 14 }}>
              Subsets waiting to be processed
            </p>
            <button
              onClick={handleRefresh}
              style={{
                padding: '10px 14px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 10,
                color: '#e5e7eb',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              🔄 Refresh
            </button>
          </div>

          {sortedSubsets.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 0',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
              <h3 style={{ color: '#9ca3af', fontSize: 18, marginBottom: 8 }}>No Pending Subsets</h3>
              <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 0 }}>
                Nothing to process right now.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sortedSubsets.map((subsetName) => (
                <div
                  key={subsetName}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#f8f8f8', fontSize: 15, fontWeight: 700, fontFamily: 'monospace' }}>
                      {subsetName}
                    </div>
                  </div>

                  <button
                    onClick={() => handleProcess(subsetName)}
                    disabled={processingSubset === subsetName}
                    style={{
                      padding: '10px 14px',
                      background: processingSubset === subsetName
                        ? 'rgba(156, 163, 175, 0.5)'
                        : 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      borderRadius: 10,
                      color: 'white',
                      cursor: processingSubset === subsetName ? 'not-allowed' : 'pointer',
                      fontSize: 14,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      opacity: processingSubset === subsetName ? 0.7 : 1,
                    }}
                  >
                    {processingSubset === subsetName ? 'Fetching files...' : '▶︎ Process Job'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

