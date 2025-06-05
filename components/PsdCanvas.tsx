import React, { type ReactNode, useMemo, useState, useCallback, useEffect } from 'react';
import { usePsdStore } from '../web/store/psdStore';

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

interface PsdCanvasProps {
  layers: Layer[];
  tempDir?: string;
  width: number;
  height: number;
  showDebug?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  isThumbnail?: boolean;
}

interface RefreshedUrls {
  [layerId: number]: {
    url: string;
    refreshCount: number;
    isRefreshing: boolean;
  };
}

const renderCanvasLayers = (
  layers: Layer[],
  tempDir: string,
  canvasWidth: number,
  canvasHeight: number,
  scale: number,
  edits: any,
  originals: any,
  showDebug: boolean = false,
  refreshedUrls: RefreshedUrls = {},
  handleImageError: (layerId: number, originalUrl: string) => void = () => {},
  objectUrls: Record<number, string> = {}
): ReactNode[] => {
  console.log('Layers received by PsdCanvas:', layers);
  console.log('tempDir:', tempDir);
  console.log('Edits:', edits);
  console.log('Originals:', originals);
  // Add a random color for each bbox for debugging
  const debugColors = [
    'rgba(255,0,0,0.3)', 'rgba(0,255,0,0.3)', 'rgba(0,0,255,0.3)',
    'rgba(255,255,0,0.3)', 'rgba(0,255,255,0.3)', 'rgba(255,0,255,0.3)',
    'rgba(255,128,0,0.3)', 'rgba(128,0,255,0.3)', 'rgba(0,128,255,0.3)'
  ];

  return layers.flatMap((layer, idx) => {
    // Check visibility from edits or originals
    const effectiveVisible = edits.visibility.hasOwnProperty(layer.id)
      ? edits.visibility[layer.id]
      : originals.visibility[layer.id];

    console.log(
      'Layer:', layer.name,
      '| ID:', layer.id,
      '| Visible:', effectiveVisible,
      '| Original Visible:', originals.visibility[layer.id],
      '| Edit Visible:', edits.visibility[layer.id],
      '| Preview:', layer.preview,
      '| Status:', layer.preview_status,
    );

    if (!effectiveVisible) return [];

    // If this is a group (has children), always recurse into children, even if no bbox
    if (layer.children && layer.children.length > 0) {
      // Optionally, you could render a visual indicator for the group here
      // But always recurse into children
      return renderCanvasLayers(layer.children, tempDir, canvasWidth, canvasHeight, scale, edits, originals, showDebug, refreshedUrls, handleImageError, objectUrls);
    }

    // Only render if we have valid layer properties
    if (!layer.layer_properties?.bbox) return [];

    let [left, top, right, bottom] = layer.layer_properties.bbox;
    let bboxW = right - left;
    let bboxH = bottom - top;
    // BBox validation: skip if width/height are not positive
    if (bboxW <= 0 || bboxH <= 0) return [];

    // Clamp bbox to canvas bounds
    left = Math.max(0, Math.min(left, canvasWidth));
    top = Math.max(0, Math.min(top, canvasHeight));
    right = Math.max(left, Math.min(right, canvasWidth));
    bottom = Math.max(top, Math.min(bottom, canvasHeight));
    
    // Recalculate dimensions after clamping
    bboxW = right - left;
    bboxH = bottom - top;

    let imgW = bboxW;
    let imgH = bboxH;
    if (layer.image_analysis?.size) {
      imgW = layer.image_analysis.size[0];
      imgH = layer.image_analysis.size[1];
    }
    const opacity = (layer.layer_properties?.opacity ?? 255) / 255;

    const elements = [];
    // Handle different layer types
    if (layer.type === 'type') {
      // Check if there's a text edit for this layer
      const hasTextEdit = edits.text.hasOwnProperty(layer.id);
      const editedText = hasTextEdit ? edits.text[layer.id] : null;
      
      if (hasTextEdit && editedText !== null) {
        // Render custom text instead of image
        // Make text size fit the height better - use 90% of height, with reasonable min/max
        const fontSize = Math.max(12, Math.min(bboxH * 0.9, 120)) * scale;
        elements.push(
          <div
            key={layer.id}
            style={{
              position: 'absolute',
              left: left + (bboxW / 2),
              top: top,
              width: 'auto',
              minWidth: bboxW,
              height: bboxH,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              color: '#ffffff',
              fontSize: fontSize,
              fontFamily: 'Arial, sans-serif',
              fontWeight: 'normal',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              opacity,
              overflow: 'visible',
              textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
              transform: 'translateX(-50%)',
            }}
          >
            {editedText}
          </div>
        );
      } else {
        // Use refreshed URL if available, otherwise use original
        const imageUrl = refreshedUrls[layer.id]?.url || layer.preview;
        
        elements.push(
          <div
            key={layer.id}
            style={{
              position: 'absolute',
              left: left,
              top: top,
              width: bboxW,
              height: bboxH,
              overflow: 'hidden',
              pointerEvents: 'none',
            }}
          >
            {imageUrl && (
              <img
                src={imageUrl}
                alt={layer.name}
                style={{
                  width: bboxW,
                  height: bboxH,
                  opacity,
                  objectFit: 'contain',
                  position: 'absolute',
                  left: 0,
                  top: 0,
                }}
                onError={(e) => {
                  e.preventDefault();
                  handleImageError(layer.id, layer.preview || '');
                }}
              />
            )}
            {refreshedUrls[layer.id]?.isRefreshing && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: Math.max(10, 12 * scale),
                  zIndex: 10,
                }}
              >
                Refreshing...
              </div>
            )}
          </div>
        );
      }
    } else if (layer.preview || refreshedUrls[layer.id]?.url || edits.smartObjects.hasOwnProperty(layer.id)) {
      // Check if this layer has a smart object replacement
      const hasSmartObjectEdit = edits.smartObjects.hasOwnProperty(layer.id);
      const replacedFile = hasSmartObjectEdit ? edits.smartObjects[layer.id] : null;
      
      // Use replaced image URL if available, then refreshed URL, then original
      let imageUrl = refreshedUrls[layer.id]?.url || layer.preview;
      
      if (replacedFile && replacedFile instanceof File && objectUrls[layer.id]) {
        // Use the managed object URL for the replaced file
        imageUrl = objectUrls[layer.id];
      }
      
      // Aspect fill logic for all other layers
      const bboxAR = bboxW / bboxH;
      const imgAR = imgW / imgH;
      let drawW, drawH, offsetX, offsetY;
      if (imgAR > bboxAR) {
        drawH = bboxH;
        drawW = imgW * (bboxH / imgH);
        offsetX = -(drawW - bboxW) / 2;
        offsetY = 0;
      } else {
        drawW = bboxW;
        drawH = imgH * (bboxW / imgW);
        offsetX = 0;
        offsetY = -(drawH - bboxH) / 2;
      }

      elements.push(
        <div
          key={layer.id}
          style={{
            position: 'absolute',
            left: left,
            top: top,
            width: bboxW,
            height: bboxH,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <img
            src={imageUrl}
            alt={layer.name}
            style={{
              width: drawW,
              height: drawH,
              opacity,
              objectFit: 'cover',
              position: 'absolute',
              left: offsetX,
              top: offsetY,
            }}
            onError={(e) => {
              e.preventDefault();
              handleImageError(layer.id, layer.preview || '');
            }}
          />
          {refreshedUrls[layer.id]?.isRefreshing && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: Math.max(10, 12 * scale),
                zIndex: 10,
              }}
            >
              Refreshing...
            </div>
          )}
        </div>
      );
    } else {
      elements.push(
        <div
          key={layer.id}
          style={{
            position: 'absolute',
            left: left,
            top: top,
            width: bboxW,
            height: bboxH,
            backgroundColor: showDebug ? 'rgba(128, 128, 128, 0.2)' : 'transparent',
            border: showDebug ? '1px dashed rgba(255, 255, 255, 0.3)' : 'none',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: Math.max(10, 12 * scale),
            textAlign: 'center',
            padding: '4px',
          }}
        >
          {layer.preview_status === 'error' && 'Preview Error'}
          {layer.preview_status === 'no_pixels' && 'No Pixels'}
          {layer.preview_status === 'failed' && 'Preview Failed'}
          {!layer.preview_status && 'No Preview'}
        </div>
      );
    }
    if (showDebug) {
      elements.push(
        <div
          key={`${layer.id}-debug`}
          style={{
            position: 'absolute',
            left: left,
            top: top,
            width: bboxW,
            height: bboxH,
            border: `2px solid ${debugColors[idx % debugColors.length]}`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              background: '#222',
              color: '#fff',
              fontSize: Math.max(8, 10 * scale),
              padding: '0 2px',
              opacity: 0.8,
            }}
          >
            {layer.name} (id: {layer.id})
          </span>
        </div>
      );
    }
    return elements;
  });
};

const PsdCanvas: React.FC<PsdCanvasProps> = ({ layers, tempDir = '', width, height, showDebug = false, maxWidth, maxHeight, isThumbnail = false }) => {
  const { edits, originals } = usePsdStore();
  const [refreshedUrls, setRefreshedUrls] = useState<RefreshedUrls>({});
  const [objectUrls, setObjectUrls] = useState<Record<number, string>>({});

  const refreshPreSignedUrl = useCallback(async (layerId: number, originalUrl: string) => {
    // Prevent concurrent refreshes for the same layer
    if (refreshedUrls[layerId]?.isRefreshing) {
      return;
    }

    // Don't retry more than 3 times
    if (refreshedUrls[layerId]?.refreshCount >= 3) {
      console.warn(`Max refresh attempts reached for layer ${layerId}`);
      return;
    }

    console.log(`Refreshing pre-signed URL for layer ${layerId}`);
    
    // Mark as refreshing
    setRefreshedUrls(prev => ({
      ...prev,
      [layerId]: {
        ...prev[layerId],
        isRefreshing: true,
        refreshCount: (prev[layerId]?.refreshCount || 0) + 1,
      }
    }));

    try {
      // Extract the file path from the original URL
      // Assuming the URL format is something like: https://domain/path/to/file.png?signature=...
      const url = new URL(originalUrl);
      const filePath = url.pathname;
      
      // Call API to get new pre-signed URL (1 week = 604800 seconds)
      const response = await fetch('/api/refresh-presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          filePath: filePath,
          expiresIn: 604800 // 1 week in seconds
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to refresh URL: ${response.statusText}`);
      }

      const { url: newUrl } = await response.json();
      
      // Update the refreshed URLs state
      setRefreshedUrls(prev => ({
        ...prev,
        [layerId]: {
          url: newUrl,
          refreshCount: prev[layerId]?.refreshCount || 1,
          isRefreshing: false,
        }
      }));

      console.log(`Successfully refreshed URL for layer ${layerId}`);
    } catch (error) {
      console.error(`Failed to refresh pre-signed URL for layer ${layerId}:`, error);
      
      // Mark as not refreshing on error
      setRefreshedUrls(prev => ({
        ...prev,
        [layerId]: {
          ...prev[layerId],
          isRefreshing: false,
        }
      }));
    }
  }, [refreshedUrls]);

  const handleImageError = useCallback((layerId: number, originalUrl: string) => {
    console.log(`Image load failed for layer ${layerId}, attempting to refresh URL`);
    refreshPreSignedUrl(layerId, originalUrl);
  }, [refreshPreSignedUrl]);

  // Create and manage object URLs for replaced smart objects
  useEffect(() => {
    const newObjectUrls: Record<number, string> = {};
    
    // Create object URLs for smart object replacements
    Object.entries(edits.smartObjects).forEach(([layerId, file]) => {
      if (file && file instanceof File) {
        const id = Number(layerId);
        newObjectUrls[id] = URL.createObjectURL(file);
      }
    });
    
    // Clean up old object URLs
    Object.values(objectUrls).forEach(url => {
      URL.revokeObjectURL(url);
    });
    
    setObjectUrls(newObjectUrls);
    
    // Cleanup on unmount
    return () => {
      Object.values(newObjectUrls).forEach(url => {
        URL.revokeObjectURL(url);
      });
    };
  }, [edits.smartObjects]); // Only depend on smartObjects to avoid cleanup issues

  // Calculate scale to fit canvas in available space
  // Use provided maxWidth/maxHeight or default to viewport-based calculation
  const availableWidth = maxWidth || (typeof window !== 'undefined' ? window.innerWidth * 0.6 : 800); // 60% for main content area
  const availableHeight = maxHeight || (typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600); // 70% for canvas area
  
  const scaleX = availableWidth / width;
  const scaleY = availableHeight / height;
  const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
  
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;

  const canvasLayers = useMemo(() => renderCanvasLayers(layers, tempDir, width, height, scale, edits, originals, showDebug, refreshedUrls, handleImageError, objectUrls), [layers, tempDir, width, height, scale, edits, originals, showDebug, refreshedUrls, handleImageError, objectUrls]);
  
  // Check if there are any changes that need warnings (only show if not thumbnail)
  const hasSmartObjectChanges = !isThumbnail && Object.keys(edits.smartObjects).length > 0;
  const hasTextChanges = !isThumbnail && Object.keys(edits.text).length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <div
        style={{
          width: scaledWidth,
          height: scaledHeight,
          position: 'relative',
          background: '#1e1e1e',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          overflow: 'hidden',
          border: '1px solid #30343c',
        }}
      >
        <div
          style={{
            width: width,
            height: height,
            position: 'relative',
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {canvasLayers}
        </div>
      </div>
      
      {(hasSmartObjectChanges || hasTextChanges) && (
        <div
          style={{
            maxWidth: scaledWidth,
            padding: '8px 12px',
            fontSize: '12px',
            color: '#9ca3af',
            lineHeight: '1.3',
          }}
        >
          {hasSmartObjectChanges && (
            <div>• Smart Object Replacements: Rotation and transformation details may not be precisely preserved.</div>
          )}
          {hasTextChanges && (
            <div>• Text Modifications: Font family, weight, and exact sizing may vary from the original PSD.</div>
          )}
        </div>
      )}
    </div>
  );
};

export default PsdCanvas; 