import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import styles from '../../styles/Review.module.css';
import NavBar from '../../components/NavBar';
import PsdCanvas from '../../components/PsdCanvas';
import { usePsdStore } from '../../web/store/psdStore';
import { collectLayerParameters, buildFireflyLayersPayload } from '../../web/utils/firefly';

export default function ReviewPage() {
  const router = useRouter();
  const { psdfile, changesJson } = router.query;
  const { data, edits, originals } = usePsdStore();
  const [error, setError] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(1);

  // Calculate zoom to fit within thumbnail size
  const THUMBNAIL_MAX_WIDTH = 320;
  const THUMBNAIL_MAX_HEIGHT = 180;
  const canvasWidth = data?.summary?.psd_info?.size?.[0] || 800;
  const canvasHeight = data?.summary?.psd_info?.size?.[1] || 600;
  const scale = Math.min(
    THUMBNAIL_MAX_WIDTH / canvasWidth,
    THUMBNAIL_MAX_HEIGHT / canvasHeight,
    1
  );

  useEffect(() => {
    if (!data && psdfile) {
      fetch(`/api/process-psd?file=${psdfile}`)
        .then(res => res.json())
        .catch(() => {
          setError('Failed to fetch or process PSD.');
        });
    }
  }, [psdfile, data]);

  useEffect(() => {
    if (!data?.layers || !edits || !originals) return;

    // Build dummy smartObjectUrls (empty strings for now, since we don't have presigned URLs here)
    const smartObjectUrls: Record<number, string> = {};
    Object.keys(edits.smartObjects || {}).forEach(id => {
      smartObjectUrls[Number(id)] = '';
    });

    // Helper to determine if a layer is visible (recursively, including parent visibility)
    const isLayerVisible = (layer: any, parentVisible = true) => {
      const isEnabled = edits.visibility.hasOwnProperty(layer.id)
        ? edits.visibility[layer.id]
        : (originals.visibility ? originals.visibility[layer.id] : true);
      const effectiveVisible = parentVisible && isEnabled;
      if (!effectiveVisible) return false;
      if (layer.children && layer.children.length > 0) {
        // If group, check if any child is visible
        return layer.children.some((child: any) => isLayerVisible(child, effectiveVisible));
      }
      return effectiveVisible;
    };

    // Recursively filter only visible layers (and their visible children)
    const filterVisibleLayers = (layers: any[], parentVisible = true) => {
      if (!Array.isArray(layers)) return [];
      return layers.reduce((acc: any[], layer: any) => {
        const isEnabled = edits.visibility.hasOwnProperty(layer.id)
          ? edits.visibility[layer.id]
          : (originals.visibility ? originals.visibility[layer.id] : true);
        const effectiveVisible = parentVisible && isEnabled;
        if (!effectiveVisible) return acc;
        let filteredLayer = { ...layer };
        if (layer.children && layer.children.length > 0) {
          filteredLayer.children = filterVisibleLayers(layer.children, effectiveVisible);
        }
        acc.push(filteredLayer);
        return acc;
      }, []);
    };

    const visibleLayers = filterVisibleLayers(data.layers);
    const layersPayload = buildFireflyLayersPayload(visibleLayers, edits, originals, smartObjectUrls);
    const optionsLayers = { layers: layersPayload };
    console.log('Firefly Options Layers Preview:', JSON.stringify({ options: optionsLayers }, null, 2));
    console.log('Total visible layers in payload:', layersPayload.length);
  }, [data?.layers, edits, originals]);

  if (error) return <div className={styles.loading}>{error}</div>;
  if (!data || !Array.isArray(data.layers)) return <div className={styles.loading}>Processing PSD and loading layers...</div>;

  const changes = changesJson ? JSON.parse(changesJson as string) : [];

  // Helper: get changes for a layer
  const getLayerChanges = (layer) => {
    const origVisible = originals.visibility ? originals.visibility[layer.id] : true;
    const editVisible = edits.visibility.hasOwnProperty(layer.id)
      ? edits.visibility[layer.id]
      : origVisible;
    const changes = [];
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
    return changes;
  };

  // Helper: recursively render only changed layers (and their parents)
  const renderChangedLayerTree = (layers, parentTrail = [], depth = 0) => {
    if (!Array.isArray(layers)) return null;

    // Filter and map only changed layers or those with changed descendants
    const changedItems = layers
      .map(layer => {
        const changes = getLayerChanges(layer);
        const isGroup = !!layer.children && layer.children.length > 0;
        const childTree = isGroup ? renderChangedLayerTree(layer.children, [...parentTrail, layer.name], depth + 1) : null;

        // Only render if this layer or any child has changes
        if (changes.length === 0 && !childTree) return null;

        return (
          <li key={layer.id} className={styles.treeItem}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span>{layer.name}</span>
              {changes.map((change, idx) => (
                <span key={idx} className={styles.treeBadge + ' ' + styles.treeChange}>
                  {change.type === 'visibility' && <>visibility: {change.from} → {change.to}</>}
                  {change.type === 'text' && <>text: "{change.from}" → "{change.to}"</>}
                  {change.type === 'smartObject' && <>smart object replaced</>}
                </span>
              ))}
            </span>
            {childTree}
          </li>
        );
      })
      .filter(Boolean);

    if (changedItems.length === 0) return null;

    return (
      <ul className={styles.treeList} style={{ paddingLeft: depth * 18 }}>
        {changedItems}
      </ul>
    );
  };

  return (
    <div className={styles.pageContainer}>
      <NavBar
        showHome
        showBackToEdit
        showGenerate
        onHome={() => router.push('/')}
        onBackToEdit={() => {
          console.log('ReviewPage navigating back to Edit with psdfile:', psdfile);
          router.push(`/${psdfile}/edit`);
        }}
        onGenerate={() => router.push(`/${psdfile}/generating`)}
        title={`Review: ${psdfile}`}
      />
      <div className={styles.reviewContainer}>
        <main className={styles.mainContent}>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0' }}>
            <div className={styles.canvasWrapper}>
              <PsdCanvas
                layers={data.layers}
                tempDir={data.tempDir}
                width={canvasWidth}
                height={canvasHeight}
                zoom={scale}
              />
            </div>
          </div>
          <div className={styles.treeCard}>
            <div className={styles.treeHeader}>Layer State & Changes</div>
            {renderChangedLayerTree(data.layers)}
          </div>
        </main>
      </div>
    </div>
  );
} 