import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/Home.module.css';
import { usePsdStore } from '../web/store/psdStore';

export default function Home() {
  const [templates, setTemplates] = useState<string[]>([]);
  const router = useRouter();
  const { setPsdFile, reset } = usePsdStore();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [downloadedFiles, setDownloadedFiles] = useState<string[]>([]);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Spinner CSS
  const spinner = (
    <span style={{
      display: 'inline-block',
      width: 24,
      height: 24,
      border: '3px solid #ccc',
      borderTop: '3px solid #3b82f6',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
    }} />
  );

  // Add spinner keyframes
  if (typeof window !== 'undefined') {
    const styleId = 'spinner-keyframes';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
      document.head.appendChild(style);
    }
  }

  // Refactor file list fetch into a function
  const fetchFiles = () => {
    setLoadingFiles(true);
    fetch('/api/s3-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_method: 'list' }),
    })
      .then(res => res.json())
      .then(data => setTemplates(data.files))
      .finally(() => setLoadingFiles(false));
  };

  const fetchDownloadedFiles = () => {
    fetch('/api/list-downloaded-psds')
      .then(res => res.json())
      .then(data => setDownloadedFiles(data.files));
  };

  useEffect(() => {
    fetchFiles();
    fetchDownloadedFiles();
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadProgress(0);

    // 1. Get presigned PUT URL
    const res = await fetch('/api/s3-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_method: 'put',
        filename: selectedFile.name,
      }),
    });
    const { url } = await res.json();

    // 2. Upload with progress
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress(100);
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('Upload failed: Network error'));
      xhr.send(selectedFile);
    });

    setUploading(false);
    setSelectedFile(null);
    setUploadProgress(0);
    fetchFiles();
  };

  const handleTemplateClick = (template: string) => {
    const fileName = template.split('/').pop();
    const psdfile = fileName.replace(/\.json$/i, '');
    reset();
    router.push(`/${psdfile}/edit`);
  };

  const handleDeleteDownloaded = async (fileName: string) => {
    await fetch('/api/delete-downloaded-psd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: fileName }),
    });
    fetchDownloadedFiles();
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Asset Generation using Photoshop APIs</h1>
      <div className={styles.templates} style={downloadingKey ? { opacity: 0.5, pointerEvents: 'none', filter: 'grayscale(1)' } : {}}>
        <h2>
          {loadingFiles ? 'Fetching available PSDs in S3' : 'PSD Templates'}
        </h2>
        {loadingFiles ? (
          <div style={{ textAlign: 'center', margin: '24px 0' }}>
            <progress style={{ width: 120 }} />
          </div>
        ) : (
          <ul>
            {templates.map((template, index) => {
              const fileName = template.split('/').pop()!;
              const displayName = fileName.replace(/\.json$/i, '');
              const isDownloaded = downloadedFiles.includes(fileName);
              return (
                <li
                  key={index}
                  className={styles.templateItem}
                  onClick={() => handleTemplateClick(template)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  {displayName}
                  {isDownloaded && (
                    <>
                      <span title="Downloaded">✅</span>
                      <button
                        title="Delete local copy"
                        onClick={e => { e.stopPropagation(); handleDeleteDownloaded(fileName); }}
                        style={{ marginLeft: 4, background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16 }}
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className={styles.upload} style={downloadingKey ? { opacity: 0.5, pointerEvents: 'none', filter: 'grayscale(1)' } : {}}>
        <h2>Upload New PSD</h2>
        {!uploading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="file"
              accept=".psd"
              onChange={e => setSelectedFile(e.target.files?.[0] || null)}
              disabled={uploading || !!downloadingKey}
            />
            <button
              onClick={handleUpload}
              disabled={!selectedFile || !!downloadingKey}
              style={{ padding: '8px 18px', fontWeight: 600 }}
            >
              Upload
            </button>
          </div>
        )}
        {uploading && (
          <div style={{ marginTop: 12 }}>
            <progress value={uploadProgress} max={100} style={{ width: 120, verticalAlign: 'middle' }} />
            <span style={{ marginLeft: 8 }}>{uploadProgress}%</span>
          </div>
        )}
      </div>
    </div>
  );
} 