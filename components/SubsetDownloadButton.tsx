'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { contentPipelineApi } from '../web/utils/contentPipelineApi';
import { buildS3UploadsPath } from '../utils/environment';

type SubsetDownloadCacheEntry = {
  // Inferred (and stable) S3 folder path for this subset’s download folder
  folder?: string;
  // Presigned ZIP download URL for the folder
  download_url?: string;
  // ISO timestamp
  expires_at?: string;
  // ISO timestamp
  created_at?: string;
};

// v2: folder inference changed (no trailing "/download/" suffix)
const CACHE_STORAGE_KEY = 'subset_download_folder_url_cache_v2';
const EXPIRY_SAFETY_WINDOW_MS = 60_000; // treat “about to expire” as expired

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadCache(): Record<string, SubsetDownloadCacheEntry> {
  if (typeof window === 'undefined') return {};
  const parsed = safeParseJson<Record<string, SubsetDownloadCacheEntry>>(localStorage.getItem(CACHE_STORAGE_KEY));
  if (!parsed || typeof parsed !== 'object') return {};
  return parsed;
}

function saveCache(cache: Record<string, SubsetDownloadCacheEntry>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // ignore storage quota / privacy mode failures
  }
}

function isValidEntry(entry: SubsetDownloadCacheEntry | undefined): entry is Required<Pick<SubsetDownloadCacheEntry, 'download_url' | 'expires_at'>> & SubsetDownloadCacheEntry {
  if (!entry?.download_url || !entry.expires_at) return false;
  const expiresMs = new Date(entry.expires_at).getTime();
  if (!Number.isFinite(expiresMs)) return false;
  return expiresMs > Date.now() + EXPIRY_SAFETY_WINDOW_MS;
}

function formatSecondsRemaining(expiresAtIso?: string): string | null {
  if (!expiresAtIso) return null;
  const expiresMs = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(expiresMs)) return null;
  const seconds = Math.floor((expiresMs - Date.now()) / 1000);
  if (seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function ensureTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

function inferSubsetDownloadFolderFromSubsetName(subsetName: string): string {
  // Requirement: subsetName is in the shape "<projectCode>-<subsetFolder>"
  // Example desired folder:
  // asset_generator/dev/uploads/NotProcessed/11TBB1_2250/SubetFolder/
  const idx = subsetName.indexOf('-');
  if (idx <= 0 || idx >= subsetName.length - 1) {
    throw new Error('Subset name missing project/subset separator "-"');
  }

  const projectCode = subsetName.slice(0, idx).trim();
  const subsetFolder = subsetName.slice(idx + 1).trim();
  if (!projectCode || !subsetFolder) {
    throw new Error('Invalid subset name (empty project code or subset folder)');
  }

  return ensureTrailingSlash(buildS3UploadsPath(`NotProcessed/${projectCode}/${subsetFolder}`));
}

function inferSubsetDownloadFolderFromAnyPresignedUrl(presignedUrl: string): string {
  // Example presigned URL path:
  // /asset_generator/dev/uploads/<something>/<subset>/PDFs/file.pdf?... -> want /asset_generator/dev/uploads/<something>/<subset>/
  const u = new URL(presignedUrl);
  const pathname = decodeURIComponent(u.pathname || '').replace(/^\/+/, '');
  if (!pathname) throw new Error('Unable to infer subset folder (empty URL path)');

  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error('Unable to infer subset folder (unexpected URL path)');

  // If the URL includes a PDFs folder segment, treat the subset root as the parent of "PDFs"
  const pdfIdx = parts.findIndex((p) => p.toLowerCase() === 'pdfs');
  const subsetRootParts = pdfIdx > 0 ? parts.slice(0, pdfIdx) : parts.slice(0, -1);
  const subsetRoot = subsetRootParts.join('/');
  if (!subsetRoot) throw new Error('Unable to infer subset root from URL path');

  return ensureTrailingSlash(`${subsetRoot}`);
}

export function SubsetDownloadButton({ subsetName }: { subsetName: string }) {
  const [entry, setEntry] = useState<SubsetDownloadCacheEntry | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load cached entry once per subsetName
  useEffect(() => {
    const cache = loadCache();
    setEntry(cache[subsetName] || null);
  }, [subsetName]);

  const hasValidUrl = useMemo(() => isValidEntry(entry || undefined), [entry]);
  const expiresInLabel = useMemo(() => formatSecondsRemaining(entry?.expires_at), [entry?.expires_at]);

  const persistEntry = useCallback((next: SubsetDownloadCacheEntry) => {
    setEntry(next);
    const cache = loadCache();
    cache[subsetName] = next;
    saveCache(cache);
  }, [subsetName]);

  const handleDownload = useCallback(() => {
    if (!entry?.download_url) return;
    const link = document.createElement('a');
    link.href = entry.download_url;
    link.download = `${subsetName}.zip`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [entry?.download_url, subsetName]);

  const createOrDownload = useCallback(async () => {
    setError(null);

    // If we have a valid cached URL, just download.
    if (hasValidUrl) {
      handleDownload();
      return;
    }

    setIsWorking(true);
    try {
      // Prefer cached inferred folder path to avoid re-deriving it.
      let folder = entry?.folder;
      if (!folder) {
        // Primary inference: parse subsetName "<projectCode>-<subsetFolder>"
        // Fallback: infer from any presigned URL returned for the subset.
        try {
          folder = inferSubsetDownloadFolderFromSubsetName(subsetName);
        } catch {
          const urls = await contentPipelineApi.getSubsetPresignedUrls(subsetName);
          if (!urls || urls.length === 0) {
            throw new Error('No presigned URLs found for subset (cannot infer download folder path)');
          }
          folder = inferSubsetDownloadFolderFromAnyPresignedUrl(urls[0]);
        }
      }

      const resp = await contentPipelineApi.downloadS3Folder(folder);
      if (!resp?.success || !resp?.data?.download_url) {
        throw new Error(resp?.message || 'Failed to create download link');
      }

      const expiresIn = typeof resp.data.expires_in === 'number' ? resp.data.expires_in : 3600;
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      persistEntry({
        folder,
        download_url: resp.data.download_url,
        created_at: createdAt,
        expires_at: expiresAt,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
    } finally {
      setIsWorking(false);
    }
  }, [entry?.folder, hasValidUrl, handleDownload, persistEntry, subsetName]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <button
        onClick={createOrDownload}
        disabled={isWorking}
        title={
          error ||
          (hasValidUrl
            ? (expiresInLabel ? `Link ready (expires in ${expiresInLabel})` : 'Link ready')
            : 'Prepare download link')
        }
        style={{
          padding: '10px 14px',
          background: isWorking
            ? 'rgba(156, 163, 175, 0.5)'
            : hasValidUrl
              ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
              : 'rgba(255, 255, 255, 0.08)',
          border: hasValidUrl
            ? 'none'
            : error
              ? '1px solid rgba(239, 68, 68, 0.55)'
              : '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: 10,
          color: '#e5e7eb',
          cursor: isWorking ? 'not-allowed' : 'pointer',
          fontSize: 14,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          opacity: isWorking ? 0.75 : 1,
          minHeight: 40,
        }}
        aria-label={hasValidUrl ? `Download ${subsetName} zip (link ready)` : `Prepare ${subsetName} zip`}
      >
        {isWorking ? (
          <>
            <span
              style={{
                width: 16,
                height: 16,
                border: '2px solid rgba(255,255,255,0.3)',
                borderTop: '2px solid #fff',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'subset-download-spin 1s linear infinite',
              }}
            />
            Preparing Zip
          </>
        ) : (
          <>
            <span style={{ fontSize: 16, lineHeight: 1 }}>⬇︎</span>
            Download Zip
          </>
        )}
      </button>

      <style jsx>{`
        @keyframes subset-download-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

