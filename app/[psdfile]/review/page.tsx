'use client';

import React, { useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import styles from '../../../styles/Review.module.css';
import PsdCanvas from '../../../components/PsdCanvas';
import { usePsdStore } from '../../../web/store/psdStore';
import { collectLayerParameters, buildFireflyLayersPayload } from '../../../web/utils/firefly';

export default function ReviewPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const psdfile = params.psdfile;
  const changesJson = searchParams.get('changesJson');
  const { data, edits, originals } = usePsdStore();
  const [error, setError] = React.useState<string | null>(null);

  const canvasWidth = data?.summary?.psd_info?.size?.[0] || 800;
  const canvasHeight = data?.summary?.psd_info?.size?.[1] || 600;

  // Construct the S3 public URL for assets
  let templateStr = Array.isArray(psdfile) ? psdfile[0] : psdfile;
  if (templateStr && !templateStr.endsWith('.json')) {
    templateStr = `${templateStr}.json`;
  }
  const psdFileName = templateStr ? templateStr.replace(/\.json$/i, '') : '';
  const tempDir = `https://topps-nexus-powertools.s3.us-east-1.amazonaws.com/asset_generator/dev/public/${psdFileName}/assets/`;

  // Thumbnail sizing for review page
  const THUMBNAIL_MAX_WIDTH = 480;
  const THUMBNAIL_MAX_HEIGHT = 320;

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

    // Remove filterVisibleLayers and isLayerVisible logic for Firefly payload
    const layersPayload = buildFireflyLayersPayload(data.layers, edits, originals, smartObjectUrls);
    const optionsLayers = { layers: layersPayload };
    console.log('Firefly Options Layers Preview:', JSON.stringify({ options: optionsLayers }, null, 2));
    console.log('Total changed layers in payload:', layersPayload.length);
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

  // Clean up the filename for display
  const displayName = psdfile ? String(psdfile).replace(/\.json$/i, '') : 'Unknown';

  return (
    <div className={styles.pageContainer}>
      <div className={styles.reviewContainer}>
        <main className={styles.mainContent}>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 24px 0' }}>
            <div className={styles.canvasWrapper}>
              <PsdCanvas
                layers={data.layers}
                tempDir={tempDir}
                width={canvasWidth}
                height={canvasHeight}
                maxWidth={THUMBNAIL_MAX_WIDTH}
                maxHeight={THUMBNAIL_MAX_HEIGHT}
                isThumbnail={true}
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