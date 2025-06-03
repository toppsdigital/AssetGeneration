import React, { useEffect, useState, type ReactNode, useRef } from 'react';
import { useRouter } from 'next/router';
import styles from '../../styles/Edit.module.css';
import { usePsdStore } from '../../web/store/psdStore';
import NavBar from '../../components/NavBar';
import PsdCanvas from '../../components/PsdCanvas';
import Spinner from '../../components/Spinner';

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

interface LayerData {
  psd_file: string;
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
  const { psdfile } = router.query;
  const psdfileStr = Array.isArray(psdfile) ? psdfile[0] : psdfile;
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
    lastLoadedPsd,
    setLastLoadedPsd,
  } = usePsdStore();
  const [selectedLayer, setSelectedLayer] = useState<Layer | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [tempDir, setTempDir] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    if (!psdfileStr) return;

    // Only reset and fetch if the PSD is different from the last loaded one in the store
    if (lastLoadedPsd !== psdfileStr) {
      reset();
      setLoading(true);

      fetch(`/api/process-psd?file=${psdfileStr}`)
        .then(res => res.json())
        .then(json => {
          // STRONG GUARD: Only set data if the PSD matches
          console.log('Fetched PSD file:', json.psd_file, 'Requested PSD file:', psdfileStr);
          if (json.psd_file && json.psd_file.replace(/\.psd$/i, '') === psdfileStr) {
            setData(json);
            setTempDir(`/temp/${psdfileStr}`);
            // Initialize originals only if not already set or PSD file changes
            if (!originals.visibility || Object.keys(originals.visibility).length === 0 || (data && data.psd_file !== json.psd_file)) {
              const vis: Record<number, boolean> = {};
              const texts: Record<number, string> = {};
              const smartObjs: Record<number, string | undefined> = {};
              const setFromPsd = (layers: Layer[]) => {
                layers.forEach(layer => {
                  // Make all layers visible by default, regardless of PSD settings
                  vis[layer.id] = layer.layer_properties?.visible ?? true;
                  if (layer.type === 'type' && layer.layer_properties?.text) {
                    texts[layer.id] = layer.layer_properties.text;
                  }
                  if (layer.type === 'smartobject' && layer.preview) {
                    smartObjs[layer.id] = layer.preview;
                  }
                  if (layer.children && layer.children.length > 0) {
                    setFromPsd(layer.children);
                  }
                });
              };
              setFromPsd(json.layers);
              setOriginals({ visibility: vis, text: texts, smartObjects: smartObjs });
            }
            setEdits({ visibility: {}, text: {}, smartObjects: {} });
            setLoading(false);
            setLastLoadedPsd(psdfileStr);
          } else {
            setError('Loaded PSD does not match requested file!');
            setLoading(false);
            console.error('PSD mismatch:', json.psd_file, psdfileStr);
          }
        })
        .catch(err => {
          setError('Failed to fetch or process PSD.');
          setLoading(false);
          console.error('Fetch error:', err);
        });
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [psdfileStr, lastLoadedPsd]);

  const toggleVisibility = (id: number) => {
    const effectiveVisible = edits.visibility.hasOwnProperty(id)
      ? edits.visibility[id]
      : originals.visibility[id];
    updateVisibility(id, !effectiveVisible);
    if (!effectiveVisible) {
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
    router.push({
      pathname: `/${psdfileStr}/review`,
      query: { changesJson: JSON.stringify(changes) },
    });
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

  const handleZoom = (factor: number) => {
    setZoom(z => Math.max(0.1, Math.min(3, z * factor)));
  };
  const handleResetZoom = () => setZoom(1);

  if (error) return <div className={styles.loading}>{error}</div>;
  if (loading || !data || !Array.isArray(data.layers)) return <Spinner />;

  const psdInfo = data.summary?.psd_info;
  const canvasWidth = psdInfo?.size?.[0] || 800;
  const canvasHeight = psdInfo?.size?.[1] || 600;
  const colorMode = psdInfo?.color_mode || '';
  const depth = psdInfo?.depth || '';

  const backgroundLayerId = findBackgroundLayerId(data.layers);

  return (
    <div className={styles.pageContainer}>
      <NavBar
        showHome
        showReview
        onHome={() => router.push('/')}
        onReview={handleReview}
        title={`Edit: ${psdfile}`}
      />
      <div className={styles.editContainer}>
        <main className={styles.mainContent}>
          <div className={styles.canvasWrapper}>
            <PsdCanvas
              layers={data.layers}
              tempDir={data.tempDir}
              width={canvasWidth}
              height={canvasHeight}
              zoom={zoom}
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
              📐 {canvasWidth} × {canvasHeight}px<br />
              🎨 {colorMode ? (colorMode === '3' ? 'RGB' : `Color Mode ${colorMode}`) : ''}<br />
              🔍 Zoom: {Math.round(zoom * 100)}%<br />
              Depth: {depth}
            </div>
            <div className={styles.zoomControls}>
              <button className={styles.zoomBtn} onClick={() => handleZoom(0.8)}>−</button>
              <button className={styles.zoomBtn} onClick={() => handleZoom(1.25)}>+</button>
              <button className={styles.zoomBtn} onClick={handleResetZoom}>Reset</button>
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