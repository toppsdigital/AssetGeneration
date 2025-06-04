// WARNING: Never expose your real client_secret in production frontend code!
// For production, proxy this through a secure backend.

export async function getFireflyToken(): Promise<string> {
  const res = await fetch('/api/firefly-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'auth' }),
  });
  if (!res.ok) throw new Error('Failed to get Firefly token');
  const data = await res.json();
  return data.access_token || data.token || data;
}

export async function createFireflyAsset({ body }: { body: any }) {
  const res = await fetch('/api/firefly-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to create Firefly asset');
  return await res.json();
}

export function buildFireflyChangesPayload({
  layers,
  edits,
  originals,
  smartObjectPutUrls,
  psdPutUrl,
  outputPutUrl,
  outputPreviewUrl
}: {
  layers: any[];
  edits: any;
  originals: any;
  smartObjectPutUrls: Record<number, string>;
  psdPutUrl: string;
  outputPutUrl: string;
  outputPreviewUrl: string;
}) {
  function collectChangedLayers(layers: any[]): any[] {
    let changed: any[] = [];
    for (const layer of layers) {
      const changes: any = {};
      let hasChange = false;
      // Visibility
      if (edits.visibility.hasOwnProperty(layer.id) && edits.visibility[layer.id] !== originals.visibility[layer.id]) {
        changes.visible = edits.visibility[layer.id];
        hasChange = true;
      }
      // Text
      if (layer.type === 'type' && edits.text.hasOwnProperty(layer.id) && edits.text[layer.id] !== originals.text[layer.id]) {
        changes.text = { content: edits.text[layer.id] };
        hasChange = true;
      }
      // Smart object
      if (layer.type === 'smartobject' && edits.smartObjects.hasOwnProperty(layer.id) && smartObjectPutUrls[layer.id]) {
        changes.input = {
          storage: 'external',
          href: smartObjectPutUrls[layer.id]
        };
        hasChange = true;
      }
      // If any change, add the layer
      if (hasChange) {
        changed.push({
          name: layer.name,
          ...changes,
          edit: {}
        });
      }
      // Recurse into children
      if (layer.children) {
        changed = changed.concat(collectChangedLayers(layer.children));
      }
    }
    return changed;
  }
  const changedLayers = collectChangedLayers(layers);
  return {
    inputs: [
      {
        storage: 'external',
        href: psdPutUrl
      }
    ],
    options: {
      layers: changedLayers
    },
    outputs: [
      {
        href: outputPreviewUrl,
        storage: 'external',
        type: 'image/png'
      },
      {
        href: outputPutUrl,
        storage: 'external',
        type: 'image/vnd.adobe.photoshop'
      }
    ]
  };
}

// Shared function to collect changed layer parameters for Firefly options.parameters
export function collectLayerParameters(layers: any[], edits: any, originals: any) {
  const params: Record<string, any> = {};
  for (const layer of layers) {
    const layerKey = `layer-${layer.id}`;
    // Text change
    if (layer.type === 'type' && edits.text && originals.text && edits.text.hasOwnProperty(layer.id) && edits.text[layer.id] !== originals.text[layer.id]) {
      params[layerKey] = {
        type: 'text',
        value: edits.text[layer.id]
      };
    }
    // Visibility change
    if (edits.visibility && originals.visibility && edits.visibility.hasOwnProperty(layer.id) && edits.visibility[layer.id] !== originals.visibility[layer.id]) {
      params[layerKey] = {
        ...(params[layerKey] || {}),
        type: 'visibility',
        visible: edits.visibility[layer.id]
      };
    }
    // Smart object/image change
    if (layer.type === 'smartobject' && edits.smartObjects && originals.smartObjects && edits.smartObjects.hasOwnProperty(layer.id)) {
      params[layerKey] = {
        type: 'image',
        href: `[SMART_OBJECT_URL_${layer.id}]`, // Placeholder for actual URL
        storage: 'external'
      };
    }
    // Recurse into children
    if (layer.children && Array.isArray(layer.children)) {
      Object.assign(params, collectLayerParameters(layer.children, edits, originals));
    }
  }
  return params;
}

// Build Firefly options.layers array for payload
export function buildFireflyLayersPayload(layers: any[], edits: any, originals: any, smartObjectPutUrls: Record<number, string>) {
  // Helper to recursively collect all changed layers into a flat array
  function collectChangedLayersFlat(layers: any[]): any[] {
    let changed: any[] = [];
    for (const layer of layers) {
      const id = layer.id;
      // Determine visibility (edits take precedence, else originals, else true)
      const originalVisible = originals.visibility && originals.visibility.hasOwnProperty(id)
        ? originals.visibility[id]
        : true;
      const editedVisible = edits.visibility && edits.visibility.hasOwnProperty(id)
        ? edits.visibility[id]
        : originalVisible;
      const hasVisibilityChange = editedVisible !== originalVisible;
      const hasTextChange = layer.type === 'type' && edits.text && edits.text.hasOwnProperty(id) && edits.text[id] !== originals.text?.[id];
      const hasSmartObjectChange = layer.type === 'smartobject' && smartObjectPutUrls && smartObjectPutUrls[id];

      // If any change, add the layer (flat, no children)
      if (hasVisibilityChange || hasTextChange || hasSmartObjectChange) {
        const obj: any = {
          name: layer.name,
          visible: editedVisible,
          edit: {},
        };
        if (hasTextChange) {
          obj.text = { content: edits.text[id] };
        }
        if (hasSmartObjectChange) {
          obj.input = {
            storage: 'external',
            href: smartObjectPutUrls[id]
          };
        }
        changed.push(obj);
      }
      // Recurse into children
      if (layer.children && Array.isArray(layer.children)) {
        changed = changed.concat(collectChangedLayersFlat(layer.children));
      }
    }
    return changed;
  }
  // Return flat array of changed layers
  return collectChangedLayersFlat(layers);
}

// New reusable function to build the Firefly payload
export function buildFireflyPayload(data: any, edits: any, originals: any, smartObjectUrls: Record<number, string>) {
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
  return optionsLayers;
} 