'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import styles from '../../../styles/Edit.module.css';
import { usePsdStore } from '../../../web/store/psdStore';
import Spinner from '../../../components/Spinner';

interface Layer {
  id: number;
  name: string;
  type: string;
  preview?: string;
  preview_status: string;
  layer_properties: any;
  image_analysis?: any;
  children?: Layer[];
}

interface TemplateLayerData {
  json_file: string;
  summary: any;
  layers: Layer[];
  tempDir?: string;
}

export default function DigitalExtractionPage() {
  const router = useRouter();
  const params = useParams();
  const psdfile = params.psdfile;
  let templateStr = Array.isArray(psdfile) ? psdfile[0] : psdfile;
  if (templateStr && !templateStr.endsWith('.json')) {
    templateStr = `${templateStr}.json`;
  }
  
  const {
    data,
    edits,
    originals,
    setData,
    setEdits,
    setOriginals,
    updateVisibility,
    updateText,
    updateSmartObject,
    reset,
    lastLoadedTemplate,
    setLastLoadedTemplate,
  } = usePsdStore();
  
  const [selectedLayer, setSelectedLayer] = useState<Layer | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const folderPathInputRef = useRef<HTMLInputElement>(null);

  // Load template data (copied from edit.tsx)
  useEffect(() => {
    if (!templateStr) {
      console.log('[DigitalExtractionPage] No templateStr, skipping fetch.');
      return;
    }
    if (lastLoadedTemplate !== templateStr) {
      console.log('[DigitalExtractionPage] Resetting store and starting JSON fetch for:', templateStr);
      reset();
      setLoading(true);
      setStatus('Loading layer data from JSON...');
      fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_method: 'get', filename: templateStr, download: true }),
      })
        .then(async res => {
          console.log('[DigitalExtractionPage] /api/s3-proxy response:', res);
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            console.error('[DigitalExtractionPage] S3 proxy error:', errJson.error || 'Failed to fetch JSON data.');
            throw new Error(errJson.error || 'Failed to fetch JSON data.');
          }
          return res.json();
        })
        .then(json => {
          console.log('[DigitalExtractionPage] Downloaded JSON content:', json);
          setData(json);
          if (!originals.visibility || Object.keys(originals.visibility).length === 0 || (data && data.json_file !== (json.json_file || ''))) {
            const vis: Record<number, boolean> = {};
            const texts: Record<number, string> = {};
            const smartObjs: Record<number, string | undefined> = {};
            const setFromJson = (layers: Layer[]) => {
              layers.forEach(layer => {
                vis[layer.id] = layer.layer_properties?.visible ?? true;
                if (layer.type === 'type' && layer.layer_properties?.text) {
                  texts[layer.id] = layer.layer_properties.text;
                }
                if (layer.type === 'smartobject' && layer.preview) {
                  smartObjs[layer.id] = layer.preview;
                }
                if (layer.children && layer.children.length > 0) {
                  setFromJson(layer.children);
                }
              });
            };
            setFromJson(json.layers);
            setOriginals({ visibility: vis, text: texts, smartObjects: smartObjs });
          }
          setEdits({ visibility: {}, text: {}, smartObjects: {} });
          setLoading(false);
          setStatus(null);
          setLastLoadedTemplate(templateStr);
          console.log('[DigitalExtractionPage] JSON loaded and state set.');
        })
        .catch(err => {
          setError(err.message || 'Failed to fetch JSON data.');
          setLoading(false);
          setStatus(null);
          console.error('[DigitalExtractionPage] Fetch error:', err);
        });
    } else {
      setLoading(false);
      setStatus(null);
      console.log('[DigitalExtractionPage] Already loaded template:', templateStr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateStr, lastLoadedTemplate]);



  // Layer functions copied exactly from edit.tsx
  const toggleVisibility = (id: number) => {
    const effectiveVisible = edits.visibility.hasOwnProperty(id)
      ? edits.visibility[id]
      : originals.visibility[id];
    updateVisibility(id, !effectiveVisible);
    if (!effectiveVisible) {
      setExpanded(exp => ({ ...exp, [id]: true }));
      // Optionally, recursively expand all children if this is a group
      const expandAllChildren = (layers: Layer[]) => {
        layers.forEach(layer => {
          setExpanded(exp => ({ ...exp, [layer.id]: true }));
          if (layer.children && layer.children.length > 0) {
            expandAllChildren(layer.children);
          }
        });
      };
      if (data && Array.isArray(data.layers)) {
        const findLayerById = (layers: Layer[]): Layer | undefined => {
          for (const layer of layers) {
            if (layer.id === id) return layer;
            if (layer.children) {
              const found = findLayerById(layer.children);
              if (found) return found;
            }
          }
          return undefined;
        };
        const toggledLayer = findLayerById(data.layers);
        if (toggledLayer && toggledLayer.children && toggledLayer.children.length > 0) {
          expandAllChildren(toggledLayer.children);
        }
      }
    } else {
      setExpanded(exp => ({ ...exp, [id]: false }));
    }
  };

  const toggleExpand = (id: number) => {
    setExpanded(exp => ({ ...exp, [id]: !exp[id] }));
  };

  const handleTextEdit = (id: number, value: string) => {
    updateText(id, value);
  };

  const handleSmartObjectEdit = (id: number, file: File | null) => {
    updateSmartObject(id, file);
  };

  // PDF folder path functions
  const handleFolderPathChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const path = event.target.value;
    setSelectedFolderPath(path);
    console.log('Folder path entered:', path);
  };

  const handleStartExtraction = async () => {
    if (!selectedFolderPath.trim()) {
      alert('Please enter a PDF folder path first.');
      return;
    }
    
    setUploadLoading(true);
    setUploadStatus('Starting PDF upload process...');
    
    try {
      // Call the local Python script to upload PDFs
      setUploadStatus('Connecting to upload service...');
      const response = await fetch('/api/upload-pdfs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderPath: selectedFolderPath,
          template: templateStr,
          layerEdits: edits,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to start PDF upload process');
      }
      
      setUploadStatus('Processing upload request...');
      const result = await response.json();
      console.log('Upload process started:', result);
      
      setUploadStatus('Redirecting to jobs page...');
      
      // Navigate to jobs page
      router.push('/jobs');
    } catch (error) {
      console.error('Error starting upload:', error);
      alert('Failed to start PDF upload process: ' + (error as Error).message);
      setUploadLoading(false);
      setUploadStatus(null);
    }
  };

  // Render layer tree exactly like edit.tsx
  const renderLayerTree = (layers?: Layer[], depth = 0, parentVisible = true) => {
    if (!Array.isArray(layers)) return null;
    return (
      <ul style={{ paddingLeft: depth * 16 }}>
        {layers.map(layer => {
          const isVisible = edits.visibility.hasOwnProperty(layer.id)
            ? edits.visibility[layer.id]
            : originals.visibility[layer.id];
          const effectiveVisible = parentVisible && isVisible;
          const isGroup = !!layer.children && layer.children.length > 0;
          const isExpanded = effectiveVisible ? (expanded[layer.id] ?? true) : false;
          // Determine changes
          const changes = [];
          const origVisible = originals.visibility[layer.id];
          const editVisible = edits.visibility.hasOwnProperty(layer.id)
            ? edits.visibility[layer.id]
            : origVisible;
          if (editVisible !== origVisible) {
            changes.push({
              type: 'visibility',
              from: origVisible ? 'enabled' : 'disabled',
              to: editVisible ? 'enabled' : 'disabled',
            });
          }
          if (edits.text && edits.text.hasOwnProperty(layer.id) && originals.text && edits.text[layer.id] !== originals.text[layer.id]) {
            changes.push({ type: 'text', from: originals.text[layer.id], to: edits.text[layer.id] });
          }
          if (edits.smartObjects && edits.smartObjects.hasOwnProperty(layer.id) && originals.smartObjects && edits.smartObjects[layer.id]?.name !== originals.smartObjects[layer.id]) {
            changes.push({ type: 'smartObject', from: originals.smartObjects[layer.id], to: edits.smartObjects[layer.id]?.name || '' });
          }
          return (
            <li key={layer.id} className={isGroup ? styles.groupLayer : styles.layerItem}>
              <span
                className={styles.layerName}
                onClick={() => setSelectedLayer(layer)}
                style={{
                  fontWeight: selectedLayer?.id === layer.id ? 'bold' : 'normal',
                  cursor: 'pointer',
                  color: effectiveVisible ? undefined : '#888',
                  opacity: effectiveVisible ? 1 : 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {isGroup && (
                  <span
                    onClick={e => { e.stopPropagation(); toggleExpand(layer.id); }}
                    style={{ cursor: 'pointer', marginRight: 4, userSelect: 'none', fontSize: 14 }}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </span>
                )}
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={() => toggleVisibility(layer.id)}
                  className={styles.layerCheckbox}
                  style={{ accentColor: '#3b82f6' }}
                />
                {layer.name}
                <span
                  className={styles.layerBadge + ' ' + styles.typeBadge}
                  style={{ color: effectiveVisible ? undefined : '#aaa', background: effectiveVisible ? undefined : '#444', marginLeft: 6 }}
                >
                  {layer.type}
                </span>
                {changes.map((change, idx) => (
                  <span key={idx} className={styles.layerBadge + ' ' + styles.treeChange}>
                    {change.type === 'visibility' && (
                      <>visibility: <b>{change.from}</b> → <b>{change.to}</b></>
                    )}
                    {change.type === 'text' && (
                      <>text: "{change.from}" → "{change.to}"</>
                    )}
                    {change.type === 'smartObject' && (
                      <>smart object replaced</>
                    )}
                  </span>
                ))}
              </span>
              {layer.type === 'type' && effectiveVisible && (
                <input
                  type="text"
                  value={edits.text[layer.id] ?? ''}
                  onChange={e => handleTextEdit(layer.id, e.target.value)}
                  style={{ margin: '4px 0 4px 32px', width: '80%', fontSize: 13, padding: 4, borderRadius: 4, border: '1px solid #555', background: '#23272f', color: '#fff' }}
                />
              )}
              {layer.type === 'smartobject' && effectiveVisible && (
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleSmartObjectEdit(layer.id, e.target.files?.[0] || null)}
                  style={{ margin: '4px 0 4px 32px', fontSize: 13 }}
                />
              )}
              {isGroup && isExpanded && renderLayerTree(layer.children, depth + 1, effectiveVisible)}
            </li>
          );
        })}
      </ul>
    );
  };

  if (error) return <div className={styles.loading}>{error}</div>;
  if (status) return <div className={styles.loading}><Spinner /> {status}</div>;
  if (loading || !data || !Array.isArray(data.layers)) {
    return <div className={styles.loading}><Spinner /> Loading template data...</div>;
  }

  const displayName = templateStr ? templateStr.replace(/\.json$/i, '') : 'Unknown';

  return (
    <div className={styles.pageContainer}>
      
      {/* Upload Loading Overlay */}
      {uploadLoading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          color: 'white'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 20,
            padding: 40,
            textAlign: 'center',
            maxWidth: 500,
            width: '90%'
          }}>
            <div style={{
              fontSize: 60,
              marginBottom: 20,
              animation: 'pulse 1.5s infinite'
            }}>
              📤
            </div>
            
            <h2 style={{
              fontSize: '1.8rem',
              fontWeight: 600,
              marginBottom: 16,
              color: '#3b82f6'
            }}>
              Uploading PDFs
            </h2>
            
            <Spinner />
            
            <p style={{
              fontSize: 16,
              color: '#e0e0e0',
              marginTop: 16,
              lineHeight: 1.5
            }}>
              {uploadStatus || 'Processing your request...'}
            </p>
            
            <div style={{
              marginTop: 24,
              padding: 16,
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 12,
              fontSize: 14,
              color: '#93c5fd'
            }}>
              💡 <strong>Tip:</strong> This process runs in the background. You'll be redirected to the results page once complete.
            </div>
          </div>
        </div>
      )}
      
      <div className={styles.editContainer}>
        <main className={styles.mainContent}>
          <div style={{ 
            maxWidth: 600, 
            width: '100%',
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 16,
            padding: 32,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            <h2 style={{ marginBottom: 24, fontSize: '1.5rem', fontWeight: 600, color: '#f8f8f8' }}>
              PDF Folder Path
            </h2>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: '#e0e0e0' }}>
                Enter the full path to your PDF folder:
              </label>
              <input
                ref={folderPathInputRef}
                type="text"
                value={selectedFolderPath}
                onChange={handleFolderPathChange}
                placeholder="/Users/mvemula/Desktop/25TBB1_BALL_TO_THE_HALL"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  e.target.style.border = '1px solid rgba(59, 130, 246, 0.5)';
                  e.target.style.background = 'rgba(255, 255, 255, 0.15)';
                }}
                onBlur={(e) => {
                  e.target.style.border = '1px solid rgba(255, 255, 255, 0.2)';
                  e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                }}
              />
            </div>
            
            {/* Helper tip */}
            <div style={{
              marginBottom: 16,
              padding: 12,
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 8,
              color: '#93c5fd',
              fontSize: 13
            }}>
              💡 <strong>Tip:</strong> Right-click your PDF folder in Finder → "Get Info" → copy the path, or drag the folder into Terminal to get the full path.
            </div>
            
            {selectedFolderPath && (
              <div style={{
                marginTop: 16,
                padding: 12,
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: 8,
                color: '#10b981',
                fontSize: 14
              }}>
                ✅ Folder path set: <strong>{selectedFolderPath}</strong>
              </div>
            )}
            
            <div style={{ marginTop: 32, textAlign: 'center' }}>
                              <button
                  onClick={handleStartExtraction}
                  disabled={!selectedFolderPath || loading || uploadLoading}
                  style={{
                    padding: '16px 48px',
                    fontSize: 18,
                    fontWeight: 600,
                    background: (!selectedFolderPath || loading || uploadLoading) 
                      ? 'rgba(255, 255, 255, 0.1)' 
                      : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 12,
                    cursor: (!selectedFolderPath || loading || uploadLoading) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    opacity: (!selectedFolderPath || loading || uploadLoading) ? 0.5 : 1
                  }}
                >
                  {uploadLoading ? 'Uploading...' : 'Start Uploading PDFs'}
                </button>
            </div>
          </div>
        </main>
        
        <aside className={styles.sidebar}>
          <h2>Layers</h2>
          {renderLayerTree(data.layers)}
        </aside>
      </div>
    </div>
  );
} 