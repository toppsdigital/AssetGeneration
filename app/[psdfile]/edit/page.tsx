'use client';

import React, { useEffect, useState, type ReactNode, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import styles from '../../../styles/Edit.module.css';
import { usePsdStore } from '../../../web/store/psdStore';
import NavBar from '../../../components/NavBar';
import PsdCanvas from '../../../components/PsdCanvas';
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

interface Change {
  id: number;
  trail: string;
  name: string;
  type: string;
  changeType: 'visibility' | 'text' | 'smartObject';
  from: any;
  to: any;
}

export default function EditPage() {
  const router = useRouter();
  const params = useParams();
  const psdfile = params.psdfile as string;
  
  let templateStr = psdfile;
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
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [tempDir, setTempDir] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!templateStr) {
      console.log('[EditPage] No templateStr, skipping fetch.');
      return;
    }
    if (lastLoadedTemplate !== templateStr) {
      console.log('[EditPage] Resetting store and starting JSON fetch for:', templateStr);
      reset();
      setLoading(true);
      setStatus('Loading layer data from JSON...');
      fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_method: 'get', filename: templateStr, download: true }),
      })
        .then(async res => {
          console.log('[EditPage] /api/s3-proxy response:', res);
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            console.error('[EditPage] S3 proxy error:', errJson.error || 'Failed to fetch JSON data.');
            throw new Error(errJson.error || 'Failed to fetch JSON data.');
          }
          return res.json();
        })
        .then(json => {
          console.log('[EditPage] Downloaded JSON content:', json);
          setData(json);
          const psdFileName = templateStr.replace(/\.json$/i, '');
          setTempDir(`https://topps-nexus-powertools.s3.us-east-1.amazonaws.com/asset_generator/dev/public/${psdFileName}/assets/`);
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
          console.log('[EditPage] JSON loaded and state set.');
        })
        .catch(err => {
          setError(err.message || 'Failed to fetch JSON data.');
          setLoading(false);
          setStatus(null);
          console.error('[EditPage] Fetch error:', err);
        });
    } else {
      // Even if template is already loaded, ensure tempDir is set
      const psdFileName = templateStr.replace(/\.json$/i, '');
      setTempDir(`https://topps-nexus-powertools.s3.us-east-1.amazonaws.com/asset_generator/dev/public/${psdFileName}/assets/`);
      setLoading(false);
      setStatus(null);
      console.log('[EditPage] Already loaded template:', templateStr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateStr, lastLoadedTemplate]);

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

  const toggleAllLayers = () => {
    if (!data || !Array.isArray(data.layers)) return;
    const allVisible = Object.values(edits.visibility).every(Boolean);
    const setAll = (layers: Layer[]) => {
      layers.forEach(layer => {
        updateVisibility(layer.id, !allVisible);
        if (layer.children) setAll(layer.children);
      });
    };
    setAll(data.layers);
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

  const buildTrail = (layer: Layer, parentTrail: string[] = []): string => {
    return [...parentTrail, layer.name].join(' > ');
  };

  const hasAnyChanges = (): boolean => {
    return (
      Object.keys(edits.visibility).length > 0 ||
      Object.keys(edits.text).length > 0 ||
      Object.keys(edits.smartObjects).length > 0
    );
  };

  const collectChanges = (layers: Layer[], parentTrail: string[] = []): any[] => {
    const changes: any[] = [];
    layers.forEach(layer => {
      const trail = buildTrail(layer, parentTrail);
      
      // Check visibility changes
      if (edits.visibility.hasOwnProperty(layer.id)) {
        changes.push({
          id: layer.id,
          trail,
          name: layer.name,
          type: layer.type,
          changeType: 'visibility',
          from: originals.visibility[layer.id],
          to: edits.visibility[layer.id]
        });
      }
      
      // Check text changes
      if (edits.text.hasOwnProperty(layer.id)) {
        changes.push({
          id: layer.id,
          trail,
          name: layer.name,
          type: layer.type,
          changeType: 'text',
          from: originals.text[layer.id],
          to: edits.text[layer.id]
        });
      }
      
      // Check smart object changes
      if (edits.smartObjects.hasOwnProperty(layer.id)) {
        changes.push({
          id: layer.id,
          trail,
          name: layer.name,
          type: layer.type,
          changeType: 'smartObject',
          from: originals.smartObjects[layer.id],
          to: edits.smartObjects[layer.id] ? 'New file uploaded' : 'File removed'
        });
      }
      
      if (layer.children) {
        changes.push(...collectChanges(layer.children, [...parentTrail, layer.name]));
      }
    });
    return changes;
  };

  const handleReview = () => {
    if (hasAnyChanges()) {
      router.push(`/${psdfile}/review`);
    }
  };

  const renderLayerTree = (layers?: Layer[], depth = 0, parentVisible = true) => {
    if (!layers) return null;

    return layers.map(layer => {
      const effectiveVisible = edits.visibility.hasOwnProperty(layer.id)
        ? edits.visibility[layer.id]
        : originals.visibility[layer.id];
      const isExpanded = expanded[layer.id];
      const hasChildren = layer.children && layer.children.length > 0;
      const currentVisible = parentVisible && effectiveVisible;

      return (
        <div key={layer.id} className={styles.layerItem}>
          <div
            className={`${styles.layerRow} ${selectedLayer?.id === layer.id ? styles.selected : ''}`}
            style={{ paddingLeft: `${depth * 20}px` }}
            onClick={() => setSelectedLayer(layer)}
          >
            {hasChildren && (
              <button
                className={styles.expandButton}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(layer.id);
                }}
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            )}
            
            <input
              type="checkbox"
              checked={effectiveVisible}
              onChange={() => toggleVisibility(layer.id)}
              onClick={(e) => e.stopPropagation()}
            />
            
            <span className={styles.layerName}>
              {layer.name} ({layer.type})
            </span>
            
            {layer.type === 'type' && (
              <input
                type="text"
                value={edits.text[layer.id] ?? originals.text[layer.id] ?? ''}
                onChange={(e) => handleTextEdit(layer.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className={styles.textInput}
              />
            )}
            
            {layer.type === 'smartobject' && (
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleSmartObjectEdit(layer.id, e.target.files?.[0] || null)}
                onClick={(e) => e.stopPropagation()}
                className={styles.fileInput}
              />
            )}
          </div>
          
          {hasChildren && isExpanded && (
            <div className={styles.children}>
              {renderLayerTree(layer.children, depth + 1, currentVisible)}
            </div>
          )}
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <NavBar title={`Edit - ${psdfile || 'Loading...'}`} />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spinner />
            <p style={{ marginTop: '20px', color: '#666' }}>{status || 'Loading...'}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <NavBar title={`Edit - ${psdfile || 'Error'}`} />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <h2 style={{ color: '#ef4444', marginBottom: '20px' }}>Error Loading Template</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>{error}</p>
            <button 
              onClick={() => router.push('/')}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <NavBar title={`Edit - ${psdfile || 'Not Found'}`} />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ color: '#666' }}>Template not found</p>
            <button onClick={() => router.push('/')}>Back to Home</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <NavBar title={`Edit - ${psdfile}`} />
      <div className={styles.content}>
        <div className={styles.editLayout}>
          {/* Layer Panel */}
          <div className={styles.layerPanel}>
            <div className={styles.panelHeader}>
              <h3>Layers</h3>
              <button onClick={toggleAllLayers} className={styles.toggleAllButton}>
                Toggle All
              </button>
            </div>
            <div className={styles.layerTree}>
              {renderLayerTree(data.layers)}
            </div>
          </div>

          {/* Canvas Panel */}
          <div className={styles.canvasPanel}>
            <div className={styles.canvasContainer}>
              <PsdCanvas 
                layers={data.layers}
                width={data.summary?.psd_info?.size?.[0] || 800}
                height={data.summary?.psd_info?.size?.[1] || 600}
                tempDir={tempDir}
              />
            </div>
          </div>

          {/* Properties Panel */}
          <div className={styles.propertiesPanel}>
            <div className={styles.panelHeader}>
              <h3>Properties</h3>
            </div>
            {selectedLayer ? (
              <div className={styles.layerProperties}>
                <h4>{selectedLayer.name}</h4>
                <p>Type: {selectedLayer.type}</p>
                <p>ID: {selectedLayer.id}</p>
                {selectedLayer.layer_properties && (
                  <div>
                    <h5>Layer Properties:</h5>
                    <pre>{JSON.stringify(selectedLayer.layer_properties, null, 2)}</pre>
                  </div>
                )}
              </div>
            ) : (
              <p>Select a layer to view properties</p>
            )}
          </div>
        </div>

        {/* Action Bar */}
        <div className={styles.actionBar}>
          <button 
            onClick={() => router.push('/')}
            className={styles.cancelButton}
          >
            Cancel
          </button>
          <button 
            onClick={handleReview}
            disabled={!hasAnyChanges()}
            className={styles.reviewButton}
          >
            Review Changes
          </button>
        </div>
      </div>
    </div>
  );
} 