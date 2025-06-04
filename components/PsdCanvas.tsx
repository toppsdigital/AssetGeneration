import React, { type ReactNode, useMemo } from 'react';
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
  zoom: number;
  width: number;
  height: number;
  showDebug?: boolean;
}

const renderCanvasLayers = (
  layers: Layer[],
  tempDir: string,
  zoom: number,
  edits: any,
  originals: any,
  showDebug: boolean = false
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
      '| Image URL:', layer.preview ? `${tempDir}/previews/${layer.preview}` : 'none'
    );

    if (!effectiveVisible) return [];

    // If this is a group (has children), always recurse into children, even if no bbox
    if (layer.children && layer.children.length > 0) {
      // Optionally, you could render a visual indicator for the group here
      // But always recurse into children
      return renderCanvasLayers(layer.children, tempDir, zoom, edits, originals, showDebug);
    }

    // Only render if we have valid layer properties
    if (!layer.layer_properties?.bbox) return [];

    let [left, top, right, bottom] = layer.layer_properties.bbox;
    let bboxW = right - left;
    let bboxH = bottom - top;
    // BBox validation: skip if width/height are not positive
    if (bboxW <= 0 || bboxH <= 0) return [];

    // Clamp bbox to canvas bounds (assume canvasWidth/canvasHeight are available in closure)
    // If not, you may need to pass them as arguments
    // For now, clamp to 0 as minimum
    left = Math.max(0, left);
    top = Math.max(0, top);
    // Optionally clamp right/bottom to width/height if available

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
      elements.push(
        <div
          key={layer.id}
          style={{
            position: 'absolute',
            left: left * zoom,
            top: top * zoom,
            width: bboxW * zoom,
            height: bboxH * zoom,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {layer.preview && layer.preview_status && layer.preview_status.startsWith('success') && (
            <img
              src={`${tempDir}/previews/${layer.preview}`}
              alt={layer.name}
              style={{
                width: bboxW * zoom,
                height: bboxH * zoom,
                opacity,
                objectFit: 'contain',
                position: 'absolute',
                left: 0,
                top: 0,
              }}
            />
          )}
        </div>
      );
    } else if (layer.preview && layer.preview_status && layer.preview_status.startsWith('success')) {
      // Aspect fill logic for all other layers
      const bboxAR = bboxW / bboxH;
      const imgAR = imgW / imgH;
      let drawW, drawH, offsetX, offsetY;
      if (imgAR > bboxAR) {
        drawH = bboxH * zoom;
        drawW = imgW * (bboxH / imgH) * zoom;
        offsetX = -(drawW - bboxW * zoom) / 2;
        offsetY = 0;
      } else {
        drawW = bboxW * zoom;
        drawH = imgH * (bboxW / imgW) * zoom;
        offsetX = 0;
        offsetY = -(drawH - bboxH * zoom) / 2;
      }

      elements.push(
        <div
          key={layer.id}
          style={{
            position: 'absolute',
            left: left * zoom,
            top: top * zoom,
            width: bboxW * zoom,
            height: bboxH * zoom,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <img
            src={`${tempDir}/previews/${layer.preview}`}
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
          />
        </div>
      );
    } else {
      elements.push(
        <div
          key={layer.id}
          style={{
            position: 'absolute',
            left: left * zoom,
            top: top * zoom,
            width: bboxW * zoom,
            height: bboxH * zoom,
            backgroundColor: showDebug ? 'rgba(128, 128, 128, 0.2)' : 'transparent',
            border: showDebug ? '1px dashed rgba(255, 255, 255, 0.3)' : 'none',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '12px',
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
            left: left * zoom,
            top: top * zoom,
            width: bboxW * zoom,
            height: bboxH * zoom,
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
              fontSize: 10,
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

const PsdCanvas: React.FC<PsdCanvasProps> = ({ layers, tempDir = '', zoom, width, height, showDebug = false }) => {
  const { edits, originals } = usePsdStore();

  // Memoize the rendered layers to prevent unnecessary re-renders
  const renderedLayers = useMemo(() => 
    renderCanvasLayers(layers, tempDir, zoom, edits, originals, showDebug),
    [layers, tempDir, zoom, edits, originals, showDebug]
  );

  return (
    <div
      style={{
        width: width * zoom,
        height: height * zoom,
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
          width: width * zoom,
          height: height * zoom,
          position: 'relative',
        }}
      >
        {renderedLayers}
      </div>
    </div>
  );
};

export default PsdCanvas; 