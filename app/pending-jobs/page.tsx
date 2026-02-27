'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../../styles/Home.module.css';
import PageTitle from '../../components/PageTitle';
import Spinner from '../../components/Spinner';
import { contentPipelineApi } from '../../web/utils/contentPipelineApi';
import { SubsetDownloadButton } from '../../components/SubsetDownloadButton';

function OneLineAutoFitText({
  text,
  maxFontSizePx = 15,
  minFontSizePx = 9,
  style,
}: {
  text: string;
  maxFontSizePx?: number;
  minFontSizePx?: number;
  style?: React.CSSProperties;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const [fontSizePx, setFontSizePx] = useState(maxFontSizePx);

  const recompute = useCallback(() => {
    const el = elRef.current;
    if (!el) return;

    // Start from max each time (handles widening after resize).
    let lo = minFontSizePx;
    let hi = maxFontSizePx;
    let best = minFontSizePx;

    // Ensure we have a width constraint before measuring.
    if (el.clientWidth <= 0) {
      setFontSizePx(maxFontSizePx);
      return;
    }

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      el.style.fontSize = `${mid}px`;

      // scrollWidth includes overflow; clientWidth is the visible width.
      if (el.scrollWidth <= el.clientWidth) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    setFontSizePx(best);
    el.style.fontSize = `${best}px`;
  }, [maxFontSizePx, minFontSizePx]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute, text]);

  useEffect(() => {
    const el = elRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(() => recompute());
    ro.observe(el);
    return () => ro.disconnect();
  }, [recompute]);

  return (
    <div
      ref={elRef}
      title={text}
      style={{
        ...style,
        width: '100%',
        fontSize: fontSizePx,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        // Prefer fitting by shrinking. If we *still* overflow at min font size,
        // clip instead of showing trailing "...".
        textOverflow: 'clip',
      }}
    >
      {text}
    </div>
  );
}

type ViewMode = 'pending' | 'processed';

export default function PendingJobsPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('pending');
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [subsets, setSubsets] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingSubset, setProcessingSubset] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch projects for current viewMode
  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = viewMode === 'pending'
        ? await contentPipelineApi.listNotProcessedProjects()
        : await contentPipelineApi.listProcessedProjects();
      setProjects(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  }, [viewMode]);

  // Fetch subsets for selected project
  const fetchSubsets = useCallback(async (project: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const list = viewMode === 'pending'
        ? await contentPipelineApi.listNotProcessedSubsetsForProject(project)
        : await contentPipelineApi.listProcessedSubsetsForProject(project);
      setSubsets(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load subsets');
    } finally {
      setIsLoading(false);
    }
  }, [viewMode]);

  // Load projects on mount and when viewMode changes
  useEffect(() => {
    setSelectedProject(null);
    setSubsets([]);
    setSearchQuery('');
    fetchProjects();
  }, [fetchProjects]);

  // Load subsets when a project is selected
  useEffect(() => {
    if (selectedProject) {
      fetchSubsets(selectedProject);
    }
  }, [selectedProject, fetchSubsets]);

  const normalizedQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  const filteredItems = useMemo(() => {
    const source = selectedProject ? [...subsets].sort((a, b) => a.localeCompare(b)) : [...projects].sort((a, b) => a.localeCompare(b));
    if (!normalizedQuery) return source;
    return source.filter((item) => item.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, projects, subsets, selectedProject]);

  const totalCount = selectedProject ? subsets.length : projects.length;

  const handleProjectClick = (project: string) => {
    setSelectedProject(project);
    setSearchQuery('');
  };

  const handleBreadcrumbBack = () => {
    setSelectedProject(null);
    setSubsets([]);
    setSearchQuery('');
  };

  const handleToggleView = () => {
    setViewMode((prev) => (prev === 'pending' ? 'processed' : 'pending'));
  };

  const handleRefresh = () => {
    if (selectedProject) {
      fetchSubsets(selectedProject);
    } else {
      fetchProjects();
    }
  };

  const handleProcess = async (subsetName: string) => {
    if (!selectedProject) return;
    setProcessingSubset(subsetName);
    try {
      const combinedName = `${selectedProject}-${subsetName}`;
      const urls = await contentPipelineApi.getSubsetPresignedUrls(combinedName);

      if (!urls || urls.length === 0) {
        alert(`No files found for subset: ${combinedName}`);
        return;
      }

      const presignKey = `presign_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      sessionStorage.setItem(
        presignKey,
        JSON.stringify({
          subset: combinedName,
          presigned_urls: urls,
        })
      );

      setProcessingSubset(null);
      router.push(
        `/new-job?pendingSubset=${encodeURIComponent(combinedName)}&presignKey=${encodeURIComponent(presignKey)}`
      );
    } catch (e) {
      alert(`Failed to fetch presigned URLs: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setProcessingSubset((prev) => (prev === subsetName ? null : prev));
    }
  };

  const handleMarkProcessed = async (subsetName: string) => {
    if (!selectedProject) return;
    setActionInProgress(subsetName);
    try {
      await contentPipelineApi.markSubsetProcessed(selectedProject, subsetName);
      setSubsets((prev) => prev.filter((s) => s !== subsetName));
    } catch (e) {
      alert(`Failed to mark as processed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setActionInProgress((prev) => (prev === subsetName ? null : prev));
    }
  };

  const handleMoveToUnprocessed = async (subsetName: string) => {
    if (!selectedProject) return;
    setActionInProgress(subsetName);
    try {
      await contentPipelineApi.moveToNotProcessed(selectedProject, subsetName);
      setSubsets((prev) => prev.filter((s) => s !== subsetName));
    } catch (e) {
      alert(`Failed to move to unprocessed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setActionInProgress((prev) => (prev === subsetName ? null : prev));
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  // --- Breadcrumb ---
  const breadcrumb = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#9ca3af' }}>
      <span
        onClick={selectedProject ? handleBreadcrumbBack : undefined}
        style={{
          cursor: selectedProject ? 'pointer' : 'default',
          color: selectedProject ? '#60a5fa' : '#e5e7eb',
          fontWeight: selectedProject ? 400 : 700,
        }}
      >
        Projects
      </span>
      {selectedProject && (
        <>
          <span style={{ color: '#6b7280' }}>&gt;</span>
          <span style={{ color: '#e5e7eb', fontWeight: 700 }}>{selectedProject}</span>
        </>
      )}
    </div>
  );

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className={styles.container}>
        <PageTitle title="Pending" leftButton="back" />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <Spinner />
            <p style={{ marginTop: 16, color: '#e0e0e0' }}>
              Loading {selectedProject ? 'subsets' : 'projects'}...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div className={styles.container}>
        <PageTitle title="Pending" leftButton="back" />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <h2 style={{ color: '#ef4444', marginBottom: 16 }}>Error</h2>
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

  // --- Shared button style ---
  const smallBtnStyle: React.CSSProperties = {
    padding: '10px 14px',
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    color: '#e5e7eb',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };

  return (
    <div className={styles.container}>
      <PageTitle title="Pending" leftButton="back" />
      <div className={styles.content} style={{ maxWidth: 1160, padding: '0 1.5rem' }}>
        <div style={{ maxWidth: '100%', margin: '0 auto', padding: '24px' }}>

          {/* Top bar: breadcrumb + toggle + refresh */}
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
            {breadcrumb}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={handleToggleView} style={smallBtnStyle}>
                {viewMode === 'pending' ? 'Processed' : 'Pending'}
              </button>
              <button onClick={handleRefresh} style={smallBtnStyle}>
                Refresh
              </button>
            </div>
          </div>

          {/* Subtitle */}
          <p style={{ margin: '0 0 16px 0', color: '#9ca3af', fontSize: 14 }}>
            {viewMode === 'pending'
              ? selectedProject
                ? 'Subsets waiting to be processed'
                : 'Projects with pending subsets'
              : selectedProject
                ? 'Processed subsets'
                : 'Projects with processed subsets'}
          </p>

          {/* Empty state */}
          {totalCount === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 0',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 16 }}>
                {viewMode === 'pending' ? '⏳' : '✅'}
              </div>
              <h3 style={{ color: '#9ca3af', fontSize: 18, marginBottom: 8 }}>
                {selectedProject
                  ? `No ${viewMode === 'pending' ? 'pending' : 'processed'} subsets`
                  : `No ${viewMode === 'pending' ? 'pending' : 'processed'} projects`}
              </h3>
              <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 0 }}>
                Nothing here right now.
              </p>
            </div>
          ) : (
            <>
              {/* Search bar + count */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ position: 'relative', flex: '1 1 360px', minWidth: 260, maxWidth: 520 }}>
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={selectedProject ? 'Search subsets...' : 'Search projects...'}
                    aria-label="Search"
                    style={{
                      width: '100%',
                      padding: '10px 40px 10px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: '#e5e7eb',
                      outline: 'none',
                      fontSize: 14,
                    }}
                  />
                  {searchQuery.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      aria-label="Clear search"
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: '#e5e7eb',
                        cursor: 'pointer',
                        display: 'grid',
                        placeItems: 'center',
                        lineHeight: 1,
                        fontWeight: 700,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div style={{ color: '#9ca3af', fontSize: 13 }}>
                  {filteredItems.length} / {totalCount}
                </div>
              </div>

              {/* No search results */}
              {filteredItems.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '32px 0',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <h3 style={{ color: '#9ca3af', fontSize: 16, marginBottom: 8 }}>No matches</h3>
                  <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>
                    Try a different search term.
                  </p>
                  <button type="button" onClick={handleClearSearch} style={smallBtnStyle}>
                    Clear search
                  </button>
                </div>
              ) : !selectedProject ? (
                /* ===== Level 1: Project cards ===== */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {filteredItems.map((project) => (
                    <div
                      key={project}
                      onClick={() => handleProjectClick(project)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 12,
                        padding: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.10)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
                    >
                      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                        <OneLineAutoFitText
                          text={project}
                          maxFontSizePx={15}
                          minFontSizePx={9}
                          style={{ color: '#f8f8f8', fontWeight: 700, fontFamily: 'monospace' }}
                        />
                      </div>
                      <span style={{ color: '#6b7280', fontSize: 18 }}>&rsaquo;</span>
                    </div>
                  ))}
                </div>
              ) : (
                /* ===== Level 2: Subset cards ===== */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {filteredItems.map((subsetName) => (
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
                      <div style={{ minWidth: 0, flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <OneLineAutoFitText
                          text={subsetName}
                          maxFontSizePx={15}
                          minFontSizePx={9}
                          style={{ color: '#f8f8f8', fontWeight: 700, fontFamily: 'monospace' }}
                        />
                        {viewMode === 'pending' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMarkProcessed(subsetName); }}
                            disabled={actionInProgress === subsetName}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#6b7280',
                              cursor: actionInProgress === subsetName ? 'not-allowed' : 'pointer',
                              fontSize: 12,
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                              opacity: actionInProgress === subsetName ? 0.5 : 1,
                              padding: '4px 8px',
                              textDecoration: 'underline',
                              textUnderlineOffset: 2,
                              flexShrink: 0,
                            }}
                          >
                            {actionInProgress === subsetName ? 'Moving...' : 'Mark Processed'}
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                        <SubsetDownloadButton subsetName={`${selectedProject}-${subsetName}`} />

                        {viewMode === 'pending' ? (
                          <>
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
                                minHeight: 40,
                              }}
                            >
                              {processingSubset === subsetName ? 'Fetching files...' : 'Process Job'}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleMoveToUnprocessed(subsetName)}
                            disabled={actionInProgress === subsetName}
                            style={{
                              ...smallBtnStyle,
                              opacity: actionInProgress === subsetName ? 0.6 : 1,
                              cursor: actionInProgress === subsetName ? 'not-allowed' : 'pointer',
                              minHeight: 40,
                            }}
                          >
                            {actionInProgress === subsetName ? 'Moving...' : '↩ Move back to Pending'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
