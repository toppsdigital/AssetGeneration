import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/Home.module.css';
import NavBar from '../components/NavBar';
import { usePsdStore } from '../web/store/psdStore';

export default function Home() {
  const [physicalTemplates, setPhysicalTemplates] = useState<string[]>([]);
  const [singleAssetTemplates, setSingleAssetTemplates] = useState<string[]>([]);
  const router = useRouter();
  const { setPsdFile, reset } = usePsdStore();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Temporarily hide upload functionality
  const showUpload = false;

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
  const fetchFiles = async () => {
    setLoadingFiles(true);
    try {
      const res = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_method: 'list' }),
      });
      if (!res.ok) throw new Error('Failed to fetch templates');
      const data = await res.json();
      
      // Filter for only .json files in uploads/ directory (no subdirectories)
      const jsonFiles = data.files.filter((file: any) => {
        const fileName = typeof file === 'string' ? file : file.name;
        const isJsonFile = fileName.toLowerCase().endsWith('.json');
        const isInUploads = fileName.startsWith('asset_generator/dev/uploads/');
        const pathParts = fileName.split('/');
        const isDirectlyInUploads = pathParts.length === 4; // asset_generator/dev/uploads/filename.json (4 parts)
        return isJsonFile && isInUploads && isDirectlyInUploads;
      });
      
      // Categorize files based on whether they contain "Physical"
      const physical: string[] = [];
      const singleAsset: string[] = [];
      
      jsonFiles.forEach((file: any) => {
        const fileName = typeof file === 'string' ? file : file.name;
        if (fileName.toLowerCase().includes('physical')) {
          physical.push(fileName);
        } else {
          singleAsset.push(fileName);
        }
      });
      
      setPhysicalTemplates(physical);
      setSingleAssetTemplates(singleAsset);
    } catch (err) {
      alert('Error fetching templates: ' + (err as Error).message);
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      // 1. Get presigned PUT URL
      const res = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_method: 'put',
          filename: selectedFile.name,
        }),
      });
      if (!res.ok) throw new Error('Failed to get upload URL');
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
    } catch (err) {
      setUploading(false);
      alert('Error uploading file: ' + (err as Error).message);
    }
  };

  const handleTemplateClick = async (template: string) => {
    const fileName = template.split('/').pop();
    const psdfile = fileName.replace(/\.json$/i, '');
    reset();
    
    // Check if this is a physical template and route accordingly
    if (fileName && fileName.toLowerCase().includes('physical')) {
      router.push(`/${psdfile}/digital-extraction`);
    } else {
      // Check if the edit page exists before navigating
      try {
        const res = await fetch(`/${psdfile}/edit`, { method: 'HEAD' });
        if (res.ok) {
          router.push(`/${psdfile}/edit`);
        } else {
          alert('Edit page not found for this template.');
        }
      } catch {
        alert('Error checking edit page.');
      }
    }
  };

  return (
    <div className={styles.container}>
      <NavBar 
        title="Asset Generation using Photoshop APIs" 
        showViewJobs
        onViewJobs={() => router.push('/jobs')}
      />
      <div className={styles.content}>
      <div className={styles.templates} style={downloadingKey ? { opacity: 0.5, pointerEvents: 'none', filter: 'grayscale(1)' } : {}}>
        <h2>
          {loadingFiles ? 'Fetching available PSDs in S3' : 'PSD Templates'}
        </h2>
        {loadingFiles ? (
          <div style={{ textAlign: 'center', margin: '24px 0' }}>
            <progress style={{ width: 120 }} />
          </div>
        ) : (
          <>
            {/* Physical to Digital Section */}
            {physicalTemplates.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '16px', color: '#4a5568', fontSize: '18px' }}>
                  Physical to Digital
                </h3>
                <ul>
                  {physicalTemplates.map((template, index) => {
                    const fileName = template.split('/').pop()!;
                    const displayName = fileName.replace(/\.json$/i, '');
                    return (
                      <li
                        key={`physical-${index}`}
                        className={styles.templateItem}
                        onClick={() => handleTemplateClick(template)}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        {displayName}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Single Asset Creation Section */}
            {singleAssetTemplates.length > 0 && (
              <div>
                <h3 style={{ marginBottom: '16px', color: '#4a5568', fontSize: '18px' }}>
                  Single Asset Creation
                </h3>
                <ul>
                  {singleAssetTemplates.map((template, index) => {
                    const fileName = template.split('/').pop()!;
                    const displayName = fileName.replace(/\.json$/i, '');
                    return (
                      <li
                        key={`single-${index}`}
                        className={styles.templateItem}
                        onClick={() => handleTemplateClick(template)}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        {displayName}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Show message if no templates found */}
            {physicalTemplates.length === 0 && singleAssetTemplates.length === 0 && (
              <p style={{ color: '#718096', fontStyle: 'italic' }}>
                No .json template files found at the root level.
              </p>
            )}
          </>
        )}
      </div>
        {showUpload && (
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
        )}
      </div>
    </div>
  );
} 