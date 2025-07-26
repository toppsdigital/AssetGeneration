'use client';

import React, { useEffect, useState, type ReactNode, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import styles from '../../../styles/Edit.module.css';
import { usePsdStore } from '../../../web/store/psdStore';
import PsdCanvas from '../../../components/PsdCanvas';
import PageTitle from '../../../components/PageTitle';
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
  const searchParams = useSearchParams();
  const psdfile = params.psdfile;
  let templateStr = Array.isArray(psdfile) ? psdfile[0] : psdfile;
  if (templateStr && !templateStr.endsWith('.json')) {
    templateStr = `${templateStr}.json`;
  }
  
  // Get JSON URL from query parameters (preferred) or construct from templateStr (fallback)
  const jsonUrl = searchParams.get('jsonUrl') || templateStr;
  
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
  const [windowDimensions, setWindowDimensions] = useState({ width: 0, height: 0 });

  // Track window dimensions for responsive canvas sizing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const updateDimensions = () => {
        setWindowDimensions({ width: window.innerWidth, height: window.innerHeight });
      };
      
      // Set initial dimensions
      updateDimensions();
      
      // Add resize listener
      window.addEventListener('resize', updateDimensions);
      
      // Cleanup
      return () => window.removeEventListener('resize', updateDimensions);
    }
  }, []);

  useEffect(() => {
    if (!jsonUrl) {
      console.log('[EditPage] No jsonUrl, skipping fetch.');
      return;
    }
    if (lastLoadedTemplate !== jsonUrl) {
      console.log('[EditPage] Resetting store and starting JSON fetch for:', jsonUrl);
      reset();
      setLoading(true);
      setStatus('Loading layer data from JSON...');
      
      // Use proxy to fetch JSON data to avoid CORS errors
      fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_method: 'get',
          filename: jsonUrl,
          download: true,
          direct_url: true
        }),
      })
        .then(async res => {
          console.log('[EditPage] Proxy fetch response:', res);
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(`Failed to fetch JSON data via proxy: ${res.status} ${res.statusText} - ${errorData.error || 'Unknown error'}`);
          }
          return res.json();
        })
        .then(json => {
          console.log('[EditPage] Downloaded JSON content:', json);
          setData(json);
          const psdFileName = templateStr?.replace(/\.json$/i, '') || 'template';
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
          setLastLoadedTemplate(jsonUrl);
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
      const psdFileName = templateStr?.replace(/\.json$/i, '') || 'template';
      setTempDir(`https://topps-nexus-powertools.s3.us-east-1.amazonaws.com/asset_generator/dev/public/${psdFileName}/assets/`);
      setLoading(false);
      setStatus(null);
      console.log('[EditPage] Already loaded template:', jsonUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsonUrl, lastLoadedTemplate]);

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
    return [...parentTrail, layer.name].join(' → ');
  };

  const hasAnyChanges = (): boolean => {
    // Check visibility changes
    if (Object.keys(edits.visibility).length > 0) {
      for (const [id, editVisible] of Object.entries(edits.visibility)) {
        const origVisible = originals.visibility[parseInt(id)];
        if (editVisible !== origVisible) {
          return true;
        }
      }
    }

    // Check text changes
    if (Object.keys(edits.text).length > 0) {
      for (const [id, editText] of Object.entries(edits.text)) {
        const origText = originals.text[parseInt(id)];
        if (editText !== origText) {
          return true;
        }
      }
    }

    // Check smart object changes
    if (Object.keys(edits.smartObjects).length > 0) {
      for (const [id, editSmartObj] of Object.entries(edits.smartObjects)) {
        const origSmartObj = originals.smartObjects[parseInt(id)];
        if (editSmartObj && editSmartObj.name !== origSmartObj) {
          return true;
        }
      }
    }

    return false;
  };

  const collectChanges = (layers: Layer[], parentTrail: string[] = []): any[] => {
    let changes: any[] = [];
    layers.forEach(layer => {
      const trail = buildTrail(layer, parentTrail);
      // Visibility
      const origVisible = layer.layer_properties?.visible;
      const editVisible = edits.visibility.hasOwnProperty(layer.id)
        ? edits.visibility[layer.id]
        : origVisible;
      if (editVisible !== origVisible) {
        changes.push({
          id: layer.id,
          trail,
          changeType: 'visibility',
          from: origVisible ? 'enabled' : 'disabled',
          to: editVisible ? 'enabled' : 'disabled',
        });
      }
      // Text
      if (layer.type === 'type' && edits.text[layer.id] !== layer.layer_properties?.text) {
        changes.push({
          id: layer.id,
          trail,
          changeType: 'text',
          from: layer.layer_properties?.text,
          to: edits.text[layer.id],
        });
      }
      // Smart object
      if (layer.type === 'smartobject' && edits.smartObjects[layer.id]) {
        changes.push({
          id: layer.id,
          trail,
          changeType: 'smartObject',
          from: layer.preview,
          to: edits.smartObjects[layer.id]?.name || '',
        });
      }
      if (layer.children) {
        changes = changes.concat(collectChanges(layer.children, [...parentTrail, layer.name]));
      }
    });
    return changes;
  };

  const handleReview = () => {
    const changes = data ? collectChanges(data.layers) : [];
    const changesJson = encodeURIComponent(JSON.stringify(changes));
    router.push(`/${templateStr}/review?changesJson=${changesJson}`);
  };

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

  // Find the background layer id (largest bbox area or matches canvas size)
  const findBackgroundLayerId = (layers: Layer[]): number | null => {
    let maxArea = 0;
    let bgId: number | null = null;
    const check = (ls: Layer[]) => {
      ls.forEach(layer => {
        if (layer.layer_properties?.bbox) {
          const [l, t, r, b] = layer.layer_properties.bbox;
          const w = r - l;
          const h = b - t;
          const area = w * h;
          // Prefer exact match to canvas size, otherwise largest area
          if (w === canvasWidth && h === canvasHeight) {
            bgId = layer.id;
          } else if (area > maxArea) {
            maxArea = area;
            bgId = layer.id;
          }
        }
        if (layer.children) check(layer.children);
      });
    };
    check(layers);
    return bgId;
  };

  if (error) return <div className={styles.loading}>{error}</div>;
  if (status) return <div className={styles.loading}><Spinner /> {status}</div>;
  if (loading || !data || !Array.isArray(data.layers)) return <div className={styles.loading}><Spinner /> Downloading PSD Layer data...</div>;

  const psdInfo = data.summary?.psd_info;
  const canvasWidth = psdInfo?.size?.[0] || 800;
  const canvasHeight = psdInfo?.size?.[1] || 600;
  const colorMode = psdInfo?.color_mode || '';
  const depth = psdInfo?.depth || '';

  const backgroundLayerId = findBackgroundLayerId(data.layers);

  // Clean up the filename for display
  const displayName = templateStr ? templateStr.replace(/\.json$/i, '') : 'Unknown';

  return (
    <div className={styles.pageContainer}>
      <PageTitle title={`Edit: ${displayName}`} />
      <div className={styles.editContainer}>
        <main className={styles.mainContent}>
          <div className={styles.canvasWrapper}>
            <PsdCanvas
              layers={data.layers}
              tempDir={tempDir}
              width={canvasWidth}
              height={canvasHeight}
              showDebug={showDebug}
            />
          </div>
          <div className={styles.canvasFooter}>
            <button
              style={{ marginBottom: 8, fontSize: 12, padding: '2px 8px', opacity: 0.7 }}
              onClick={() => setShowDebug(v => !v)}
            >
              {showDebug ? 'Hide' : 'Show'} Debug BBoxes
            </button>
            <div className={styles.canvasInfo}>
              📐 {canvasWidth} × {canvasHeight}px • 🎨 {colorMode ? (colorMode === '3' ? 'RGB' : `Color Mode ${colorMode}`) : ''} • Depth: {depth}
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