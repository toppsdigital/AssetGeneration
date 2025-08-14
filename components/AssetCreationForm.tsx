'use client';

import { useState, useEffect } from 'react';

// For multiple spot/color selections in parallel mode
interface SpotColorPair {
  spot: string;
  color?: string;
}

interface AssetConfig {
  id: string;
  name: string; // User-editable name for the asset
  type: 'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel' | 'wp-1of1';
  layer: string;
  spot?: string;
  color?: string;
  spotColorPairs?: SpotColorPair[]; // For PARALLEL cards with multiple combinations
  vfx?: string;
  chrome: string | boolean;
  oneOfOneWp?: boolean; // For BASE assets with superfractor chrome
  wp_inv_layer?: string; // For VFX and chrome effects
}

interface AssetCreationFormProps {
  jsonData: any;
  getExtractedLayers: () => string[];
  getConfiguredAssets: () => AssetConfig[];
  generateAssetName: (type: string, config: Partial<AssetConfig>, existingNames?: string[]) => string;
  savingAsset: boolean;
  editingAssetId: string | null;
  onAddAsset: (config: AssetConfig, spotColorPairs: SpotColorPair[]) => Promise<void>;
  onResetConfig: () => void;
}

// Hardcoded color mapping for consistent color selection
const HARDCODED_COLORS = [
  { name: 'Aqua', rgb: 'R0G255B255' },
  { name: 'Black', rgb: 'R51G51B51' },
  { name: 'Blue', rgb: 'R0G102B204' },
  { name: 'Gold', rgb: 'R204G153B0' },
  { name: 'Green', rgb: 'R0G204B51' },
  { name: 'Magenta', rgb: 'R255G0B204' },
  { name: 'Orange', rgb: 'R255G102B0' },
  { name: 'Pink', rgb: 'R255G102B153' },
  { name: 'Purple', rgb: 'R153G51B255' },
  { name: 'Red', rgb: 'R255G0B0' },
  { name: 'Refractor', rgb: 'R153G153B153' },
  { name: 'Rose Gold', rgb: 'R255G102B102' },
  { name: 'Silver', rgb: 'R153G153B153' },
  { name: 'White', rgb: 'R255G255B255' },
  { name: 'Yellow', rgb: 'R255G255B0' }
];

export const AssetCreationForm = ({
  jsonData,
  getExtractedLayers,
  getConfiguredAssets,
  generateAssetName,
  savingAsset,
  editingAssetId,
  onAddAsset,
  onResetConfig
}: AssetCreationFormProps) => {
  // State management
  const [currentCardType, setCurrentCardType] = useState<'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel' | 'wp-1of1' | null>(null);
  const [currentConfig, setCurrentConfig] = useState<Partial<AssetConfig>>({
    chrome: false,
    oneOfOneWp: false,
    name: '',
    wp_inv_layer: ''
  });
  const [spotColorPairs, setSpotColorPairs] = useState<SpotColorPair[]>([{ spot: '', color: undefined }]);

  // Helper functions
  const getLayersByType = (type: 'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel' | 'wp-1of1') => {
    const extractedLayers = getExtractedLayers();
    console.log('🔍 All extracted layers:', extractedLayers);
    
    const filtered = extractedLayers.filter(layer => {
      const lowerLayer = layer.toLowerCase();
      switch(type) {
        case 'wp':
        case 'wp-1of1':
          return lowerLayer.includes('wp') && !lowerLayer.includes('inv'); // Include wp but exclude wp_inv
        case 'back': 
          return lowerLayer.startsWith('bk') || lowerLayer.includes('back');
        case 'base':
          return lowerLayer.includes('fr_cmyk') || (lowerLayer.startsWith('fr') && lowerLayer.includes('cmyk'));
        case 'parallel':
        case 'multi-parallel':
          return lowerLayer.includes('spot') && (lowerLayer.startsWith('fr') || lowerLayer.includes('front'));
        default:
          return false;
      }
    });
    
    console.log(`🎯 Filtered ${type} layers:`, filtered);
    return filtered;
  };

  const getSpotLayers = () => {
    const extractedLayers = getExtractedLayers();
    return extractedLayers.filter(layer => 
      layer.toLowerCase().includes('spot')
    );
  };

  const getVfxTextures = () => {
    // Get VFX textures from JSON data under "VFX textures" group
    const vfxGroup = jsonData?.layers?.find((layer: any) => 
      layer.name?.toLowerCase().includes('vfx') || layer.name?.toLowerCase().includes('texture')
    );
    
    if (vfxGroup && vfxGroup.children) {
      return vfxGroup.children
        .map((child: any) => child.name || 'Unnamed Texture')
        .filter((textureName: string) => !textureName.toLowerCase().includes('wpcv')); // Filter out "wpcv"
    }
    return [];
  };

  const getWpInvLayers = () => {
    const extractedLayers = getExtractedLayers();
    return extractedLayers.filter(layer => 
      layer.toLowerCase().includes('wp') && layer.toLowerCase().includes('inv')
    );
  };

  const getColorVariants = () => {
    // Return a single color group with all hardcoded colors
    return [{
      groupName: 'COLORS',
      colors: HARDCODED_COLORS
    }];
  };

  // Auto-update asset name when configuration changes
  useEffect(() => {
    if (currentCardType && !editingAssetId) {
      // Only auto-update if not editing an existing asset
      const existingNames = getConfiguredAssets().map(asset => asset.name);
      const configForName = {
        ...currentConfig,
        spotColorPairs: currentCardType === 'parallel' || currentCardType === 'multi-parallel' 
          ? spotColorPairs 
          : undefined
      };
      console.log('🔍 Name generation config:', { 
        cardType: currentCardType, 
        vfx: configForName.vfx, 
        chrome: configForName.chrome,
        spotColorPairs: configForName.spotColorPairs
      });
      const newName = generateAssetName(currentCardType, configForName, existingNames);
      
      // Only update if the name is empty or appears to be auto-generated (to preserve user edits)
      const basicPattern = generateAssetName(currentCardType, { type: currentCardType }, existingNames);
      const currentName = currentConfig.name || '';
      
      // Check if current name appears to be auto-generated by looking for patterns
      const isAutoGenerated = !currentName || 
                              currentName === basicPattern || 
                              currentName.endsWith('_1') || 
                              currentName.endsWith('_2') ||
                              currentName.startsWith(currentCardType === 'parallel' ? '' : currentCardType) ||
                              (currentCardType === 'parallel' && currentName.match(/^[a-z]+\d+$/)) ||  // matches pattern like "black1"
                              (currentCardType === 'multi-parallel' && currentName.match(/^[a-z]+\d+[a-z]+\d+/)); // matches pattern like "black1blue2"
      
      console.log('🔍 Name update check:', { 
        currentName, 
        newName, 
        basicPattern, 
        isAutoGenerated,
        shouldUpdate: isAutoGenerated 
      });
      
      if (isAutoGenerated) {
        console.log('🔄 Updating name from', currentName, 'to', newName);
        setCurrentConfig(prev => ({ ...prev, name: newName }));
      } else {
        console.log('🚫 Not updating name - appears to be user-edited');
      }
    }
  }, [currentCardType, currentConfig.layer, currentConfig.vfx, currentConfig.chrome, currentConfig.oneOfOneWp, spotColorPairs, editingAssetId, getConfiguredAssets, generateAssetName]);

  // Auto-select wp_inv layer when VFX or chrome is enabled and only one wp_inv layer exists
  useEffect(() => {
    if (currentCardType && !editingAssetId) {
      const hasVfxOrChrome = currentConfig.vfx || currentConfig.chrome;
      const wpInvLayers = getWpInvLayers();
      
      if (hasVfxOrChrome && wpInvLayers.length === 1 && !currentConfig.wp_inv_layer) {
        setCurrentConfig(prev => ({ ...prev, wp_inv_layer: wpInvLayers[0] }));
      } else if (!hasVfxOrChrome && currentConfig.wp_inv_layer) {
        // Clear wp_inv_layer if VFX and chrome are both disabled
        setCurrentConfig(prev => ({ ...prev, wp_inv_layer: '' }));
      }
    }
  }, [currentCardType, currentConfig.vfx, currentConfig.chrome, editingAssetId, getWpInvLayers]);

  const handleAddAsset = async () => {
    console.log('🔍 handleAddAsset called:', { 
      currentCardType, 
      currentConfig, 
      spotColorPairs,
      editingAssetId 
    });
    
    if (!currentCardType) {
      console.log('❌ No currentCardType, aborting');
      return;
    }
    
    const assetConfig = {
      ...currentConfig,
      type: currentCardType,
      id: editingAssetId || '' // Will be generated by backend if empty
    } as AssetConfig;
    
    console.log('🔍 Calling onAddAsset with config:', assetConfig);
    
    try {
      await onAddAsset(assetConfig, spotColorPairs);
      
      console.log('✅ onAddAsset completed successfully, resetting form');
      // Only reset form if the operation was successful
      setCurrentConfig({ chrome: false, oneOfOneWp: false, name: '', wp_inv_layer: '' });
      setCurrentCardType(null);
      setSpotColorPairs([{ spot: '', color: undefined }]);
    } catch (error) {
      console.error('❌ Error in handleAddAsset:', error);
      // Don't reset form on error so user can retry
    }
  };

  return (
    <div style={{
      flex: '0 0 300px',
      minWidth: 280,
      maxWidth: 300,
      background: 'rgba(255, 255, 255, 0.05)',
      borderRadius: 12,
      border: '1px solid rgba(255, 255, 255, 0.1)',
      padding: 16
    }}>
      <h3 style={{
        fontSize: 18,
        fontWeight: 600,
        color: '#f8f8f8',
        margin: '0 0 16px 0'
      }}>
        Select Card Type
      </h3>
      
      {/* Step 1: Card Type Selection */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {(['wp', 'back', 'base', 'parallel', 'multi-parallel'] as const)
            .filter(type => {
              // Hide multi-parallel if there's only 1 spot layer
              if (type === 'multi-parallel') {
                return getSpotLayers().length > 1;
              }
              return true;
            })
            .map(type => (
            <button
              key={type}
              onClick={() => {
                setCurrentCardType(type);
                
                // Get existing asset names to avoid duplicates
                const existingNames = getConfiguredAssets().map(asset => asset.name);
                
                if (type === 'parallel' || type === 'multi-parallel') {
                  // For parallel/multi-parallel, initialize with one empty pair
                  setSpotColorPairs([{ spot: '', color: undefined }]);
                  const initialConfig = { 
                    chrome: false,
                    type,
                    spot: '',
                    layer: '',
                    name: generateAssetName(type, { type }, existingNames)
                  };
                  setCurrentConfig(initialConfig);
                } else {
                  // For other types, clear spot/color pairs
                  setSpotColorPairs([]);
                  const layersForType = getLayersByType(type);
                  const autoSelectedLayer = layersForType.length === 1 ? layersForType[0] : '';
                  const initialConfig = { 
                    chrome: false,
                    oneOfOneWp: false,
                    type,
                    layer: autoSelectedLayer,
                    name: ''
                  };
                  initialConfig.name = generateAssetName(type, initialConfig, existingNames);
                  setCurrentConfig(initialConfig);
                }
              }}
              style={{
                padding: '8px 16px',
                background: currentCardType === type ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 8,
                color: '#f8f8f8',
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {type === 'base' ? 'BASE' : type === 'parallel' ? 'PARALLEL' : type === 'multi-parallel' ? 'MULTI-PARALLEL' : type.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic Configuration based on Card Type */}
      {currentCardType && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Layer Selection - Different layout for parallel vs others */}
          {(currentCardType === 'parallel' || currentCardType === 'multi-parallel') ? (
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8
              }}>
                <label style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#f8f8f8'
                }}>
                  Select Spot Layer & Color
                </label>
                {currentCardType === 'multi-parallel' && (
                  <button
                    onClick={() => {
                      if (spotColorPairs.length < 3) {
                        setSpotColorPairs(prev => [...prev, { spot: '', color: undefined }]);
                      }
                    }}
                    disabled={!spotColorPairs[0]?.spot || spotColorPairs.length >= 3}
                    style={{
                      width: 24,
                      height: 24,
                      background: (!spotColorPairs[0]?.spot || spotColorPairs.length >= 3)
                        ? 'rgba(156, 163, 175, 0.3)'
                        : 'rgba(34, 197, 94, 0.2)',
                      border: '1px solid ' + ((!spotColorPairs[0]?.spot || spotColorPairs.length >= 3)
                        ? 'rgba(156, 163, 175, 0.3)'
                        : 'rgba(34, 197, 94, 0.4)'),
                      borderRadius: 6,
                      color: (!spotColorPairs[0]?.spot || spotColorPairs.length >= 3) ? '#6b7280' : '#86efac',
                      fontSize: 16,
                      cursor: (!spotColorPairs[0]?.spot || spotColorPairs.length >= 3) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s'
                    }}
                    title={spotColorPairs.length >= 3 ? "Maximum 3 spots allowed" : "Add another spot/color pair"}
                  >
                    +
                  </button>
                )}
              </div>
              
              {/* Multiple Spot/Color Rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {spotColorPairs.map((pair, index) => {
                  const spotGroup = getColorVariants()[0]; // Always use first spot group
                  return (
                    <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      {/* Spot Layer Selection */}
                      <div style={{ flex: 1 }}>
                        {index === 0 && (
                          <label style={{
                            display: 'block',
                            fontSize: 12,
                            color: '#9ca3af',
                            marginBottom: 4
                          }}>
                            Spot Layer
                          </label>
                        )}
                        <select
                          value={pair.spot || ''}
                          onChange={(e) => {
                            const newPairs = [...spotColorPairs];
                            newPairs[index] = { ...newPairs[index], spot: e.target.value };
                            setSpotColorPairs(newPairs);
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: 8,
                            color: '#f8f8f8',
                            fontSize: 14,
                            marginTop: index > 0 ? '20px' : '0'
                          }}
                        >
                          <option value="" style={{ background: '#1f2937' }}>Select...</option>
                          {getSpotLayers()
                            .filter(layer => !spotColorPairs.some((p, i) => i !== index && p.spot === layer))
                            .map(layer => (
                              <option key={layer} value={layer} style={{ background: '#1f2937' }}>
                                {layer}
                              </option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Color Selection */}
                      <div style={{ flex: 1 }}>
                        {index === 0 && (
                          <label style={{
                            display: 'block',
                            fontSize: 12,
                            color: '#9ca3af',
                            marginBottom: 4
                          }}>
                            Color
                          </label>
                        )}
                        <select
                          value={pair.color || ''}
                          onChange={(e) => {
                            if (e.target.value) {
                              const newPairs = [...spotColorPairs];
                              newPairs[index] = { 
                                ...newPairs[index], 
                                color: e.target.value
                              };
                              setSpotColorPairs(newPairs);
                            } else {
                              const newPairs = [...spotColorPairs];
                              newPairs[index] = { ...newPairs[index], color: undefined };
                              setSpotColorPairs(newPairs);
                            }
                          }}
                          disabled={!pair.spot}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: 8,
                            color: '#f8f8f8',
                            fontSize: 14,
                            marginTop: index > 0 ? '20px' : '0',
                            opacity: !pair.spot ? 0.5 : 1
                          }}
                        >
                          <option value="" style={{ background: '#1f2937' }}>Select...</option>
                          {spotGroup?.colors.map((colorLayer: any, idx: number) => (
                            <option 
                              key={idx} 
                              value={colorLayer.name} 
                              style={{ background: '#1f2937' }}
                            >
                              {colorLayer.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Remove Button */}
                      <button
                        onClick={() => {
                          if (spotColorPairs.length > 1) {
                            setSpotColorPairs(prev => prev.filter((_, i) => i !== index));
                          }
                        }}
                        disabled={spotColorPairs.length === 1}
                        style={{
                          width: 32,
                          height: 32,
                          background: spotColorPairs.length === 1 
                            ? 'transparent' 
                            : 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid ' + (spotColorPairs.length === 1 
                            ? 'transparent' 
                            : 'rgba(239, 68, 68, 0.2)'),
                          borderRadius: 6,
                          color: spotColorPairs.length === 1 ? 'transparent' : '#ef4444',
                          fontSize: 16,
                          cursor: spotColorPairs.length === 1 ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          marginTop: index > 0 ? '20px' : (index === 0 ? '20px' : '0')
                        }}
                        title={spotColorPairs.length === 1 ? '' : 'Remove'}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Regular Layer Selection for non-parallel types */
            <div>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: '#f8f8f8',
                marginBottom: 8
              }}>
                Select Layer
                {(() => {
                  const layersForType = getLayersByType(currentCardType);
                  return layersForType.length === 1 ? (
                    <span style={{ 
                      fontSize: 12, 
                      color: '#10b981', 
                      fontWeight: 400,
                      marginLeft: 8 
                    }}>
                      (auto-selected)
                    </span>
                  ) : null;
                })()}
              </label>
              <select
                value={currentConfig.layer || ''}
                onChange={(e) => {
                  setCurrentConfig(prev => ({ ...prev, layer: e.target.value }));
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  color: '#f8f8f8',
                  fontSize: 14
                }}
              >
                <option value="" style={{ background: '#1f2937' }}>Select layer...</option>
                {getLayersByType(currentCardType).map(layer => (
                  <option key={layer} value={layer} style={{ background: '#1f2937' }}>
                    {layer}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* VFX Texture Selection */}
          {(((currentCardType === 'parallel' || currentCardType === 'multi-parallel') && spotColorPairs.some(pair => pair.spot)) ||
            currentCardType === 'base') && getWpInvLayers().length > 0 && (
            <div>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: '#f8f8f8',
                marginBottom: 8
              }}>
                Select VFX Texture
                <span style={{ 
                  fontSize: 12, 
                  color: '#9ca3af', 
                  fontWeight: 400,
                  marginLeft: 8 
                }}>
                  (optional)
                </span>
                {getWpInvLayers().length === 1 && (
                  <span style={{ 
                    fontSize: 12, 
                    color: '#9ca3af', 
                    fontWeight: 400,
                    marginLeft: 8 
                  }}>
                    - using {getWpInvLayers()[0]}
                  </span>
                )}
              </label>
              <select
                value={currentConfig.vfx || ''}
                onChange={(e) => setCurrentConfig(prev => ({ ...prev, vfx: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  color: '#f8f8f8',
                  fontSize: 14
                }}
              >
                <option value="" style={{ background: '#1f2937' }}>Select VFX texture...</option>
                {getVfxTextures().map((texture: string) => (
                  <option key={texture} value={texture} style={{ background: '#1f2937' }}>
                    {texture}
                  </option>
                ))}
              </select>
              
              {/* WP_INV Layer Selection - Show when VFX or chrome is enabled and wp_inv layers exist */}
              {(currentConfig.vfx || currentConfig.chrome) && getWpInvLayers().length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <label style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#f8f8f8',
                    marginBottom: 8
                  }}>
                    Select WP_INV Layer
                    {getWpInvLayers().length === 1 && (
                      <span style={{ 
                        fontSize: 12, 
                        color: '#10b981', 
                        fontWeight: 400,
                        marginLeft: 8 
                      }}>
                        (auto-selected)
                      </span>
                    )}
                  </label>
                  <select
                    value={currentConfig.wp_inv_layer || ''}
                    onChange={(e) => setCurrentConfig(prev => ({ ...prev, wp_inv_layer: e.target.value }))}
                    disabled={getWpInvLayers().length === 1}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: 8,
                      color: '#f8f8f8',
                      fontSize: 14,
                      opacity: getWpInvLayers().length === 1 ? 0.7 : 1
                    }}
                  >
                    <option value="" style={{ background: '#1f2937' }}>
                      {getWpInvLayers().length === 1 ? getWpInvLayers()[0] : 'Select wp_inv layer...'}
                    </option>
                    {getWpInvLayers().length > 1 && getWpInvLayers().map(wpInvLayer => (
                      <option key={wpInvLayer} value={wpInvLayer} style={{ background: '#1f2937' }}>
                        {wpInvLayer}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Chrome Effect - Toggle for parallel/multi-parallel, dropdown for base */}
          {(currentCardType === 'base' || currentCardType === 'parallel' || currentCardType === 'multi-parallel') && getWpInvLayers().length > 0 && (
            <div>
              {currentCardType === 'base' ? (
                // Dropdown for base card type
                <>
                  <label style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#f8f8f8',
                    marginBottom: 8
                  }}>
                    Chrome Effect
                  </label>
                  <select
                    value={typeof currentConfig.chrome === 'string' ? currentConfig.chrome : ''}
                    onChange={(e) => {
                      const newChrome = e.target.value || false;
                      setCurrentConfig(prev => ({ 
                        ...prev, 
                        chrome: newChrome,
                        // Enable oneOfOneWp by default when superfractor is selected
                        oneOfOneWp: newChrome === 'superfractor' ? true : prev.oneOfOneWp
                      }));
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: 8,
                      color: '#f8f8f8',
                      fontSize: 14
                    }}
                  >
                    <option value="" style={{ background: '#1f2937' }}>None</option>
                    <option value="silver" style={{ background: '#1f2937' }}>Silver</option>
                    <option value="superfractor" style={{ background: '#1f2937' }}>Superfractor</option>
                  </select>
                  
                  {/* 10f1 wp checkbox - only show for superfractor */}
                  {currentConfig.chrome === 'superfractor' && (
                    <div style={{ marginTop: 12 }}>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#f8f8f8',
                        cursor: 'pointer'
                      }}>
                        <input
                          type="checkbox"
                          checked={currentConfig.oneOfOneWp || false}
                          onChange={(e) => setCurrentConfig(prev => ({ ...prev, oneOfOneWp: e.target.checked }))}
                          style={{ width: 16, height: 16 }}
                        />
                        10f1 wp
                      </label>
                    </div>
                  )}
                </>
              ) : (
                // Toggle for parallel/multi-parallel
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#f8f8f8',
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={currentConfig.chrome === 'silver'}
                    onChange={(e) => setCurrentConfig(prev => ({ ...prev, chrome: e.target.checked ? 'silver' : false }))}
                    style={{ width: 16, height: 16 }}
                  />
                  Chrome Effect (Silver)
                </label>
              )}
            </div>
          )}

          {/* Asset Name Input */}
          {currentCardType && (
            <div>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: '#f8f8f8',
                marginBottom: 8
              }}>
                Asset Name
              </label>
              <input
                type="text"
                value={currentConfig.name || ''}
                onChange={(e) => setCurrentConfig(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter asset name..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  color: '#f8f8f8',
                  fontSize: 14,
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                }}
              />
            </div>
          )}

          {/* Add Asset Button */}
          <div>
            {(() => {
              // Validation logic for different card types
              let canAdd = false;
              let validationMessage = '';

              console.log('🔍 Validation check:', { 
                currentCardType, 
                currentConfigName: currentConfig.name, 
                currentConfigLayer: currentConfig.layer,
                currentConfigWpInvLayer: currentConfig.wp_inv_layer,
                currentConfigVfx: currentConfig.vfx,
                currentConfigChrome: currentConfig.chrome,
                spotColorPairs: spotColorPairs,
                wpInvLayersLength: getWpInvLayers().length
              });

              if (!currentCardType) {
                validationMessage = 'Select card type';
              } else if (!currentConfig.name?.trim()) {
                validationMessage = 'Enter asset name';
              } else {
                switch (currentCardType) {
                  case 'wp':
                  case 'back':
                  case 'base':
                  case 'wp-1of1':
                    if (!currentConfig.layer) {
                      validationMessage = 'Select layer';
                    } else {
                      canAdd = true;
                    }
                    break;
                  case 'parallel':
                  case 'multi-parallel':
                    const validPairs = spotColorPairs.filter(pair => pair.spot && pair.color);
                    console.log('🔍 Parallel validation:', { 
                      spotColorPairs, 
                      validPairs, 
                      validPairsLength: validPairs.length,
                      wpInvLayersLength: getWpInvLayers().length,
                      currentConfigLayer: currentConfig.layer 
                    });
                    if (validPairs.length === 0) {
                      validationMessage = 'Select at least one spot layer and color';
                    } else if ((currentConfig.vfx || currentConfig.chrome) && getWpInvLayers().length > 1 && !currentConfig.wp_inv_layer) {
                      // Only require wp_inv layer selection if VFX/chrome is enabled and there are multiple layers
                      validationMessage = 'Select wp_inv layer';
                    } else {
                      canAdd = true; // Have at least one valid spot/color pair
                    }
                    break;
                }
              }

              console.log('🔍 Validation result:', { canAdd, validationMessage });

              return (
                <>
                  <button
                    onClick={handleAddAsset}
                    disabled={!canAdd || savingAsset}
                    style={{
                      padding: '12px 24px',
                      background: (!canAdd || savingAsset) ? 'rgba(156, 163, 175, 0.3)' : 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      borderRadius: 8,
                      color: 'white',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: (!canAdd || savingAsset) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      opacity: (!canAdd || savingAsset) ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    {savingAsset && (
                      <div style={{
                        width: 14,
                        height: 14,
                        border: '2px solid rgba(255, 255, 255, 0.3)',
                        borderTop: '2px solid white',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }} />
                    )}
                    {savingAsset ? 'Saving...' : (editingAssetId ? 'Update Asset' : 'Add Asset')}
                  </button>
                  {editingAssetId && (
                    <button
                      onClick={onResetConfig}
                      style={{
                        padding: '12px 24px',
                        background: 'rgba(156, 163, 175, 0.3)',
                        border: 'none',
                        borderRadius: 8,
                        color: 'white',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginLeft: 8
                      }}
                    >
                      Cancel
                    </button>
                  )}
                  {validationMessage && (
                    <div style={{
                      fontSize: 12,
                      color: '#9ca3af',
                      marginTop: 8
                    }}>
                      {validationMessage}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
