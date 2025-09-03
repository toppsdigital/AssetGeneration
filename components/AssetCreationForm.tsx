'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HARDCODED_COLORS, getColorNameByRgb } from '../utils/colors';

// For multiple spot/color selections in parallel mode
interface SpotColorPair {
  spot: string;
  color?: string;
}

interface AssetConfig {
  id: string;
  name: string; // User-editable name for the asset
  type: 'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel' | 'wp-1of1' | 'front';
  layer: string;
  spot?: string;
  color?: string;
  spot_color_pairs?: SpotColorPair[]; // For PARALLEL cards with multiple combinations
  vfx?: string;
  chrome: string | boolean;
  oneOfOneWp?: boolean; // For BASE assets with superfractor chrome
  wp_inv_layer?: string; // For VFX and chrome effects
  foil?: boolean; // For foil effect control
}

interface AssetCreationFormProps {
  isOpen: boolean;
  onClose: () => void;
  jsonData: any;
  getExtractedLayers: () => string[];
  getConfiguredAssets: () => AssetConfig[];
  generateAssetName: (type: string, config: Partial<AssetConfig>, existingNames?: string[]) => string;
  savingAsset: boolean;
  editingAssetId: string | null;
  editingAsset: AssetConfig | null;
  onAddAsset: (config: AssetConfig, spot_color_pairs: SpotColorPair[]) => Promise<void>;
  onResetConfig: () => void;
}



export const AssetCreationForm = ({
  isOpen,
  onClose,
  jsonData,
  getExtractedLayers,
  getConfiguredAssets,
  generateAssetName,
  savingAsset,
  editingAssetId,
  editingAsset,
  onAddAsset,
  onResetConfig
}: AssetCreationFormProps) => {
  // State management
  const [currentCardType, setCurrentCardType] = useState<'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel' | 'wp-1of1' | 'front' | null>(null);
  const [currentConfig, setCurrentConfig] = useState<Partial<AssetConfig>>({
    chrome: false,
    oneOfOneWp: false,
    name: '',
    wp_inv_layer: ''
  });
  const [spot_color_pairs, setSpot_color_pairs] = useState<SpotColorPair[]>([{ spot: '', color: undefined }]);

  // Effect to populate form when editing an existing asset
  useEffect(() => {
    if (editingAsset && editingAssetId) {
      console.log('🔄 Populating form for editing asset:', editingAsset);
      
      // Set the card type - map actual types back to 'front' if needed
      const cardTypeForUI = editingAsset.type === 'base' || editingAsset.type === 'parallel' || editingAsset.type === 'multi-parallel' 
        ? 'front' 
        : editingAsset.type;
      
      console.log('🔄 Setting form data for editing:', {
        originalType: editingAsset.type,
        cardTypeForUI,
        layer: editingAsset.layer,
        availableLayers: getLayersByType(cardTypeForUI)
      });
      
      setCurrentCardType(cardTypeForUI);
      
      // Set the configuration
      setCurrentConfig({
        id: editingAsset.id,
        name: editingAsset.name,
        layer: editingAsset.layer,
        vfx: editingAsset.vfx || '',
        chrome: editingAsset.chrome || false,
        oneOfOneWp: editingAsset.oneOfOneWp || false,
        wp_inv_layer: editingAsset.wp_inv_layer || '',
        type: editingAsset.type
      });
      
      // Set spot color pairs for parallel/multi-parallel assets
      if (editingAsset.spot_color_pairs && editingAsset.spot_color_pairs.length > 0) {
        // Convert RGB values back to color names for the UI
        const convertedPairs = editingAsset.spot_color_pairs.map(pair => ({
          spot: pair.spot,
          color: pair.color?.startsWith('R') ? getColorNameByRgb(pair.color) : pair.color
        }));
        setSpot_color_pairs(convertedPairs);
      } else if (editingAsset.spot && editingAsset.color) {
        // Handle legacy single spot/color format
        const colorName = editingAsset.color.startsWith('R') ? getColorNameByRgb(editingAsset.color) : editingAsset.color;
        setSpot_color_pairs([{ spot: editingAsset.spot, color: colorName }]);
      } else {
        // No spot colors - start with empty array for 'front' type
        setSpot_color_pairs([]);
      }
    } else {
      // Reset form when not editing
      setCurrentCardType(null);
      setCurrentConfig({
        chrome: false,
        oneOfOneWp: false,
        name: '',
        wp_inv_layer: ''
      });
      setSpot_color_pairs([]);
    }
  }, [editingAsset, editingAssetId]);



  // Helper functions
  const getLayersByType = (type: 'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel' | 'wp-1of1' | 'front') => {
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
        case 'front':
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

  // Function to determine the actual asset type based on configuration
  const determineActualAssetType = (cardType: string, config: Partial<AssetConfig>, spotPairs: SpotColorPair[]): 'base' | 'parallel' | 'multi-parallel' => {
    if (cardType !== 'front') {
      return cardType as 'base' | 'parallel' | 'multi-parallel';
    }

    // For 'front' type, determine based on configuration:
    // Base: CMYK only (non-superfractor)
    // Parallel: CMYK + superfractor OR CMYK + 1 spot
    // Multi-parallel: CMYK + more than 1 spot

    const validSpotPairs = spotPairs.filter(pair => pair.spot && pair.color);
    const hasSuperfractor = config.chrome === 'superfractor';

    if (validSpotPairs.length === 0 && !hasSuperfractor) {
      return 'base'; // CMYK only (non-superfractor)
    } else if (validSpotPairs.length === 1 || hasSuperfractor) {
      return 'parallel'; // CMYK + 1 spot OR CMYK + superfractor
    } else {
      return 'multi-parallel'; // CMYK + more than 1 spot
    }
  };

  // Auto-update asset name when configuration changes
  useEffect(() => {
    if (currentCardType && !editingAssetId) {
      // Only auto-update if not editing an existing asset
      const existingNames = getConfiguredAssets().map(asset => asset.name);
      const configForName = {
        ...currentConfig,
        spot_color_pairs: currentCardType === 'parallel' || currentCardType === 'multi-parallel' 
          ? spot_color_pairs 
          : undefined
      };
      console.log('🔍 Name generation config:', { 
        cardType: currentCardType, 
        vfx: configForName.vfx, 
        chrome: configForName.chrome,
        spot_color_pairs: configForName.spot_color_pairs
      });
      // For 'front' type, determine name type (special handling for base + superfractor)
      let typeForNaming = currentCardType;
      if (currentCardType === 'front') {
        const actualType = determineActualAssetType(currentCardType, configForName, spot_color_pairs);
        const validSpotPairs = spot_color_pairs.filter(pair => pair.spot && pair.color);
        
        // If it becomes parallel due to superfractor (not spot colors), use 'base' for naming
        if (actualType === 'parallel' && configForName.chrome === 'superfractor' && validSpotPairs.length === 0) {
          typeForNaming = 'base';
        } else {
          typeForNaming = actualType;
        }
      }
      const newName = generateAssetName(typeForNaming, configForName, existingNames);
      
      // Only update if the name is empty or appears to be auto-generated (to preserve user edits)
      const basicPattern = generateAssetName(typeForNaming, { type: typeForNaming }, existingNames);
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
  }, [currentCardType, currentConfig.layer, currentConfig.vfx, currentConfig.chrome, currentConfig.oneOfOneWp, spot_color_pairs, editingAssetId, getConfiguredAssets, generateAssetName]);

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
      spot_color_pairs,
      editingAssetId 
    });
    
    if (!currentCardType) {
      console.log('❌ No currentCardType, aborting');
      return;
    }
    
    // Determine the actual asset type for 'front' cards
    const actualType = currentCardType === 'front' 
      ? determineActualAssetType(currentCardType, currentConfig, spot_color_pairs)
      : currentCardType;

    const assetConfig = {
      ...currentConfig,
      type: actualType,
      id: editingAssetId || '' // Will be generated by backend if empty
    } as AssetConfig;
    
    console.log('🔍 Calling onAddAsset with config:', assetConfig);
    
    try {
      await onAddAsset(assetConfig, spot_color_pairs);
      
      console.log('✅ onAddAsset completed successfully, resetting form');
      // Only reset form if the operation was successful
      setCurrentConfig({ chrome: false, oneOfOneWp: false, name: '', wp_inv_layer: '' });
      setCurrentCardType(null);
      setSpot_color_pairs([]);
      // Close modal on successful add
      onClose();
    } catch (error) {
      console.error('❌ Error in handleAddAsset:', error);
      // Don't reset form on error so user can retry
    }
  };

  // Close modal and reset form when closed
  const handleClose = () => {
    setCurrentConfig({ chrome: false, oneOfOneWp: false, name: '', wp_inv_layer: '' });
    setCurrentCardType(null);
    setSpot_color_pairs([]);
    onClose();
  };

  // Don't render if modal is not open
  if (!isOpen) return null;

  // Use createPortal to render modal at document body level
  const modalElement = (
    <>
      {/* Modal Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
          overflow: 'auto'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
      >
        {/* Modal Content */}
        <div
          style={{
            backgroundColor: '#1f2937',
            borderRadius: 16,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            maxWidth: 500,
            width: '100%',
            maxHeight: '85vh',
            overflow: 'hidden',
            position: 'relative',
            margin: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div style={{
            padding: '24px 24px 16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <h2 style={{
              fontSize: 20,
              fontWeight: 600,
              color: '#f8f8f8',
              margin: 0
            }}>
              {editingAssetId ? 'Edit Asset' : 'Add New Asset'}
            </h2>
            <button
              onClick={handleClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.2)',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                color: '#f8f8f8',
                fontSize: 16,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              ✕
            </button>
          </div>

          {/* Modal Body */}
          <div style={{ 
            padding: 24, 
            maxHeight: 'calc(85vh - 100px)', 
            overflowY: 'auto' 
          }}>
            <div>
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
          {(['wp', 'back', 'front'] as const).map(type => (
            <button
              key={type}
              onClick={() => {
                setCurrentCardType(type);
                
                // Get existing asset names to avoid duplicates
                const existingNames = getConfiguredAssets().map(asset => asset.name);
                
                if (type === 'front') {
                  // For front type, initialize with no spot pairs - user can add with + button
                  setSpot_color_pairs([]);
                  const layersForType = getLayersByType(type);
                  const autoSelectedLayer = layersForType.length === 1 ? layersForType[0] : '';
                  const initialConfig = { 
                    chrome: false,
                    oneOfOneWp: false,
                    type,
                    layer: autoSelectedLayer,
                    name: ''
                  };
                  initialConfig.name = generateAssetName('base', initialConfig, existingNames); // Start with base name
                  setCurrentConfig(initialConfig);
                } else {
                  // For other types (wp, back), clear spot/color pairs
                  setSpot_color_pairs([]);
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
                {type === 'front' ? 'FRONT' : type.toUpperCase()}
              </button>
          ))}
        </div>
      </div>

      {/* Dynamic Configuration based on Card Type */}
      {currentCardType && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Layer Selection - Different layout for front vs others */}
          {currentCardType === 'front' ? (
            <div>


              {/* Base Layer Selection for Front */}
              <div style={{ marginBottom: 12 }}>
                <label style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#f8f8f8',
                  marginBottom: 8
                }}>
                  Select Base Layer
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
                  <option value="" style={{ background: '#1f2937' }}>Select base layer...</option>
                  {getLayersByType(currentCardType).map(layer => (
                    <option key={layer} value={layer} style={{ background: '#1f2937' }}>
                      {layer}
                    </option>
                  ))}
                </select>
              </div>

              {/* Add Spot Colors Button - Only show if spot layers exist */}
              {getSpotLayers().length > 0 && spot_color_pairs.length === 0 ? (
                <div style={{ marginBottom: 12 }}>
                  <button
                    onClick={() => {
                      setSpot_color_pairs([{ spot: '', color: undefined }]);
                    }}
                    style={{
                      padding: '10px 18px',
                      background: 'rgba(34, 197, 94, 0.2)',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                      borderRadius: 8,
                      color: '#86efac',
                      fontSize: 14,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(34, 197, 94, 0.3)';
                      e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.6)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.4)';
                    }}
                  >
                    <span style={{ fontSize: 16 }}>+</span>
                    Add Spot Colors
                  </button>
                </div>
              ) : getSpotLayers().length > 0 && spot_color_pairs.length > 0 ? (
                /* Spot Colors Section - Only shown when there are pairs and spot layers exist */
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
                      Spot Colors
                    </label>
                    <button
                      onClick={() => {
                        const maxSpots = Math.min(3, getSpotLayers().length);
                        if (spot_color_pairs.length < maxSpots) {
                          setSpot_color_pairs(prev => [...prev, { spot: '', color: undefined }]);
                        }
                      }}
                      disabled={spot_color_pairs.length >= Math.min(3, getSpotLayers().length)}
                      style={{
                        width: 24,
                        height: 24,
                        background: spot_color_pairs.length >= Math.min(3, getSpotLayers().length)
                          ? 'rgba(156, 163, 175, 0.3)'
                          : 'rgba(34, 197, 94, 0.2)',
                        border: '1px solid ' + (spot_color_pairs.length >= Math.min(3, getSpotLayers().length)
                          ? 'rgba(156, 163, 175, 0.3)'
                          : 'rgba(34, 197, 94, 0.4)'),
                        borderRadius: 6,
                        color: spot_color_pairs.length >= Math.min(3, getSpotLayers().length) ? '#6b7280' : '#86efac',
                        fontSize: 16,
                        cursor: spot_color_pairs.length >= Math.min(3, getSpotLayers().length) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s'
                      }}
                      title={
                        spot_color_pairs.length >= Math.min(3, getSpotLayers().length) 
                          ? `Maximum ${Math.min(3, getSpotLayers().length)} spots allowed` 
                          : "Add another spot/color pair"
                      }
                    >
                      +
                    </button>
                  </div>
                  
                  {/* Multiple Spot/Color Rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {spot_color_pairs.map((pair, index) => {
                  const spotGroup = getColorVariants()[0]; // Always use first spot group
                  return (
                    <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {/* Spot Layer Selection */}
                      <div style={{ flex: 1, minWidth: 0 }}>
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
                            const newPairs = [...spot_color_pairs];
                            newPairs[index] = { ...newPairs[index], spot: e.target.value };
                            setSpot_color_pairs(newPairs);
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
                          <option value="" style={{ background: '#1f2937' }}>Select...</option>
                          {getSpotLayers()
                            .filter(layer => !spot_color_pairs.some((p, i) => i !== index && p.spot === layer))
                            .map(layer => (
                              <option key={layer} value={layer} style={{ background: '#1f2937' }}>
                                {layer}
                              </option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Color Selection */}
                      <div style={{ flex: 1, minWidth: 0 }}>
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
                              const newPairs = [...spot_color_pairs];
                              newPairs[index] = { 
                                ...newPairs[index], 
                                color: e.target.value
                              };
                              setSpot_color_pairs(newPairs);
                            } else {
                              const newPairs = [...spot_color_pairs];
                              newPairs[index] = { ...newPairs[index], color: undefined };
                              setSpot_color_pairs(newPairs);
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
                      
                      {/* Remove Button - only render when more than one pair to avoid stealing row width */}
                      <button
                        onClick={() => {
                          setSpot_color_pairs(prev => prev.filter((_, i) => i !== index));
                        }}
                        style={{
                          width: 32,
                          height: 32,
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          borderRadius: 8,
                          color: '#ef4444',
                          fontSize: 16,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          alignSelf: 'flex-start',
                          marginTop: index === 0 ? 22 : 0
                        }}
                        title={'Remove'}
                      >
                        ×
                      </button>
                    </div>
                    );
                  })
                  }
                  </div>
                </div>
              ) : null}
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
          {(currentCardType === 'front' || currentCardType === 'base') && getWpInvLayers().length > 0 && (
            <div>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: '#f8f8f8',
                marginBottom: 8
              }}>
                Select VFX Texture
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
              
              {/* WP_INV Layer Selection - Only show when VFX or chrome is enabled and there are multiple wp_inv layers */}
              {(currentConfig.vfx || currentConfig.chrome) && getWpInvLayers().length > 1 && (
                <div style={{ marginTop: 12 }}>
                  <label style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#f8f8f8',
                    marginBottom: 8
                  }}>
                    Select WP_INV Layer
                  </label>
                  <select
                    value={currentConfig.wp_inv_layer || ''}
                    onChange={(e) => setCurrentConfig(prev => ({ ...prev, wp_inv_layer: e.target.value }))}
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
                    <option value="" style={{ background: '#1f2937' }}>Select wp_inv layer...</option>
                    {getWpInvLayers().map(wpInvLayer => (
                      <option key={wpInvLayer} value={wpInvLayer} style={{ background: '#1f2937' }}>
                        {wpInvLayer}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Chrome Effect - Dropdown for front/base */}
          {(currentCardType === 'front' || currentCardType === 'base') && getWpInvLayers().length > 0 && (
            <div>
              {(currentCardType === 'base' || currentCardType === 'front') ? (
                // Dropdown for base/front card types
                <>
                  <label style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#f8f8f8',
                    marginBottom: 8
                  }}>
                    Chrome Effect
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
              ) : null}
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

              // For front type, determine what it will become
              const actualType: string = currentCardType === 'front' 
                ? determineActualAssetType(currentCardType, currentConfig, spot_color_pairs)
                : currentCardType || '';

              // Use actualType for validation (handles front -> base/parallel/multi-parallel conversion)
              const typeToValidate = currentCardType === 'front' ? actualType : currentCardType;

              console.log('🔍 Validation check:', { 
                currentCardType, 
                actualType,
                typeToValidate,
                currentConfigName: currentConfig.name, 
                currentConfigLayer: currentConfig.layer,
                currentConfigWpInvLayer: currentConfig.wp_inv_layer,
                currentConfigVfx: currentConfig.vfx,
                currentConfigChrome: currentConfig.chrome,
                spot_color_pairs: spot_color_pairs,
                validSpotPairs: spot_color_pairs.filter(pair => pair.spot && pair.color),
                wpInvLayersLength: getWpInvLayers().length,
                hasSuperfractor: currentConfig.chrome === 'superfractor'
              });

              if (!currentCardType) {
                validationMessage = 'Select card type';
              } else if (!currentConfig.name?.trim()) {
                validationMessage = 'Enter asset name';
              } else {
                switch (typeToValidate) {
                  case 'wp':
                  case 'back':
                    if (!currentConfig.layer) {
                      validationMessage = 'Select layer';
                    } else {
                      canAdd = true;
                    }
                    break;
                  case 'base':
                  case 'wp-1of1':
                    if (!currentConfig.layer) {
                      validationMessage = currentCardType === 'front' ? 'Select base layer' : 'Select layer';
                    } else if ((currentConfig.vfx || currentConfig.chrome) && getWpInvLayers().length > 1 && !currentConfig.wp_inv_layer) {
                      // Only require wp_inv layer selection if VFX/chrome is enabled and there are multiple layers
                      validationMessage = 'Select wp_inv layer';
                    } else {
                      canAdd = true; // Base layer is required, spot colors are optional
                    }
                    break;
                  case 'parallel':
                  case 'multi-parallel':
                    if (!currentConfig.layer) {
                      validationMessage = currentCardType === 'front' ? 'Select base layer' : 'Select layer';
                    } else {
                      const validPairs = spot_color_pairs.filter(pair => pair.spot && pair.color);
                      console.log('🔍 Parallel validation:', { 
                        spot_color_pairs, 
                        validPairs, 
                        validPairsLength: validPairs.length,
                        wpInvLayersLength: getWpInvLayers().length,
                        currentConfigLayer: currentConfig.layer,
                        currentCardType,
                        actualType 
                      });
                      
                      // For front cards, spot colors are optional (they determine type)
                      // For original parallel/multi-parallel cards, always require spot colors
                      if (validPairs.length === 0 && currentCardType !== 'front') {
                        validationMessage = 'Select at least one spot layer and color';
                      } else if ((currentConfig.vfx || currentConfig.chrome) && getWpInvLayers().length > 1 && !currentConfig.wp_inv_layer) {
                        // Only require wp_inv layer selection if VFX/chrome is enabled and there are multiple layers
                        validationMessage = 'Select wp_inv layer';
                      } else {
                        canAdd = true; // Have at least one valid spot/color pair
                      }
                    }
                    break;
                  case 'front':
                    // This shouldn't happen since we convert front to actual type above
                    if (!currentConfig.layer) {
                      validationMessage = 'Select base layer';
                    } else {
                      canAdd = true;
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
                      padding: '14px 28px',
                      background: (!canAdd || savingAsset) ? 'rgba(156, 163, 175, 0.3)' : 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      borderRadius: 12,
                      color: 'white',
                      fontSize: 16,
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
                      onClick={() => {
                        onResetConfig(); // Reset the form state
                        onClose(); // Close the modal
                      }}
                      style={{
                        padding: '12px 24px',
                        background: 'rgba(156, 163, 175, 0.3)',
                        border: 'none',
                        borderRadius: 12,
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
          </div>
        </div>
      </div>
    </>
  );

  // Render modal at document body level using portal
  return typeof document !== 'undefined' 
    ? createPortal(modalElement, document.body)
    : null;
};
