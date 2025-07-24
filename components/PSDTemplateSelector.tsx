'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { contentPipelineApi } from '../web/utils/contentPipelineApi';

interface PSDFile {
  name: string;
  lastModified: string | null;
  json_url?: string;
}

interface PSDTemplateSelectorProps {
  jobData: any;
  mergedJobData: any;
  isVisible: boolean;
  creatingAssets: boolean;
  setCreatingAssets: React.Dispatch<React.SetStateAction<boolean>>;
}

interface AssetConfig {
  id: string;
  name: string;
  type: 'wp' | 'back' | 'front-base' | 'front-parallel';
  layer: string;
  spot?: string;
  color?: { id: number; name: string };
  vfx?: string;
  chrome: boolean;
}

export const PSDTemplateSelector = ({ jobData, mergedJobData, isVisible, creatingAssets, setCreatingAssets }: PSDTemplateSelectorProps) => {
  const router = useRouter();
  
  // State management
  const [physicalJsonFiles, setPhysicalJsonFiles] = useState<PSDFile[]>([]);
  const [loadingPhysicalFiles, setLoadingPhysicalFiles] = useState(false);
  const [selectedPhysicalFile, setSelectedPhysicalFile] = useState<string>('');
  const [jsonData, setJsonData] = useState<any>(null);
  const [loadingJsonData, setLoadingJsonData] = useState(false);
  
  // New asset configuration state
  const [configuredAssets, setConfiguredAssets] = useState<AssetConfig[]>([]);
  const [currentCardType, setCurrentCardType] = useState<'wp' | 'back' | 'front-base' | 'front-parallel' | null>(null);
  const [currentConfig, setCurrentConfig] = useState<Partial<AssetConfig>>({
    chrome: false
  });
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);

  // Fetch physical JSON files when component becomes visible
  useEffect(() => {
    if (isVisible) {
      fetchPhysicalJsonFiles();
    }
  }, [isVisible]);

  // Download JSON when file is selected
  useEffect(() => {
    if (selectedPhysicalFile) {
      downloadJsonFile(selectedPhysicalFile);
    } else {
      setJsonData(null);
    }
    // Clear current configuration when changing files
    setCurrentConfig({ chrome: false });
    setCurrentCardType(null);
    setConfiguredAssets([]);
  }, [selectedPhysicalFile]);

  const fetchPhysicalJsonFiles = async () => {
    try {
      setLoadingPhysicalFiles(true);
      
      console.log('🔍 Fetching physical JSON files from public endpoint...');
      
      const response = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          client_method: 'fetch_public_files',
          public_url: 'https://topps-nexus-powertools.s3.us-east-1.amazonaws.com/asset_generator/dev/public/digital_to_physical_psd_files.json',
          file_type: 'psd'
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch JSON files: ${response.status}`);
      }

      const data = await response.json();
      console.log('📁 Physical PSD files response:', data);
      
      const physicalFiles = (data.files || []).map((file: any) => ({
        name: file.file_name || file.name || '',
        lastModified: null,
        json_url: file.json_url
      }));
      
      console.log('🎯 Formatted physical JSON files:', physicalFiles);
      setPhysicalJsonFiles(physicalFiles);
      
    } catch (error) {
      console.error('❌ Error fetching physical JSON files:', error);
    } finally {
      setLoadingPhysicalFiles(false);
    }
  };

  const downloadJsonFile = async (selectedFile: string) => {
    try {
      setLoadingJsonData(true);
      setJsonData(null);
      
      console.log('🔍 Downloading JSON via S3 proxy for selected file:', selectedFile);
      
      const selectedFileData = physicalJsonFiles.find(file => file.name === selectedFile);
      
      if (!selectedFileData || !selectedFileData.json_url) {
        throw new Error(`JSON URL not found for file: ${selectedFile}`);
      }
      
      const jsonUrl = selectedFileData.json_url;
      
      const requestBody = { 
        client_method: 'get',
        filename: jsonUrl,
        download: true,
        direct_url: jsonUrl.startsWith('http://') || jsonUrl.startsWith('https://')
      };
      
      const response = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        let errorDetails = `Status: ${response.status}`;
        try {
          const errorBody = await response.text();
          errorDetails += ` - ${errorBody}`;
        } catch (e) {
          console.log('❌ Could not read error response body:', e);
        }
        throw new Error(`Failed to download JSON via proxy: ${errorDetails}`);
      }
      
      const jsonData = await response.json();
      console.log('📋 JSON data loaded successfully via proxy, keys:', Object.keys(jsonData || {}));
      
      if (jsonData && typeof jsonData === 'object') {
        setJsonData(jsonData);
      } else {
        throw new Error('Invalid JSON content received from proxy');
      }
      
    } catch (error) {
      console.error('❌ Error downloading JSON via proxy:', error);
      setJsonData(null);
    } finally {
      setLoadingJsonData(false);
    }
  };

  const createAssets = async () => {
    if (configuredAssets.length === 0) return;

    console.log('🎨 Creating digital assets with configured assets:', {
      selectedFile: selectedPhysicalFile,
      psdFile: jsonData?.psd_file,
      configuredAssets,
      totalAssets: configuredAssets.length,
    });

    setCreatingAssets(true);

    try {
      const psdFile = selectedPhysicalFile.split('/').pop()?.replace('.json', '.psd') || '';
      
      // Convert configured assets to API format
      const layers = configuredAssets.map(asset => {
        if (asset.type === 'front-parallel') {
          // For parallel front cards, use the spot layer name
          return asset.spot || asset.layer;
        }
        return asset.layer;
      });
      
      // Collect colors from parallel front cards
      const colors = configuredAssets
        .filter(asset => asset.type === 'front-parallel' && asset.color)
        .map(asset => ({
          id: asset.color!.id,
          name: asset.color!.name
        }));

      const payload = {
        colors,
        layers,
        psd_file: psdFile
      };

      console.log('📋 API Payload:', payload);

      const response = await contentPipelineApi.generateAssets(jobData!.job_id!, payload);
      
      console.log('✅ Assets creation response:', response);
      
      router.push('/jobs');
      
    } catch (error) {
      console.error('❌ Error creating assets:', error);
      alert(`Failed to create assets: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setCreatingAssets(false);
    }
  };

  const getExtractedLayers = () => {
    const extractedLayerNames = new Set<string>();
    
    const extractLayerName = (filename: string): string | null => {
      const nameWithoutExt = filename.replace(/\.(tif|pdf|png|jpg|jpeg)$/i, '');
      const parts = nameWithoutExt.split('_');
      
      if (parts.length < 3) return null;
      
      const layerParts = parts.slice(2);
      return layerParts.join('_');
    };
    
    if (mergedJobData?.content_pipeline_files) {
      mergedJobData.content_pipeline_files.forEach((fileGroup: any) => {
        if (fileGroup.extracted_files) {
          Object.keys(fileGroup.extracted_files).forEach(filename => {
            const layerName = extractLayerName(filename);
            if (layerName) {
              extractedLayerNames.add(layerName);
            }
          });
        }
      });
    }
    
    // Filter out layers containing "seq" (case-insensitive)
    const filteredLayers = Array.from(extractedLayerNames).filter(layerName => 
      !layerName.toLowerCase().includes('seq')
    );
    
    console.log('🔍 Filtered out seq layers:', Array.from(extractedLayerNames).length - filteredLayers.length, 'of', Array.from(extractedLayerNames).length, 'total layers');
    
    return filteredLayers.sort();
  };

  const getColorVariants = () => {
    const spotGroup = jsonData?.layers?.find((layer: any) => 
      layer.name?.toLowerCase().includes('spot group')
    );
    
    const collectSolidColorLayers = (layer: any): any[] => {
      const layers: any[] = [];
      if (layer.type === 'solidcolorfill') {
        layers.push(layer);
      }
      if (layer.children) {
        layer.children.forEach((child: any) => {
          layers.push(...collectSolidColorLayers(child));
        });
      }
      return layers;
    };
    
    return spotGroup ? collectSolidColorLayers(spotGroup) : [];
  };

  // Helper functions for new UI
  const getLayersByType = (type: 'wp' | 'back' | 'front-base' | 'front-parallel') => {
    const extractedLayers = getExtractedLayers();
    console.log('🔍 All extracted layers:', extractedLayers);
    
    const filtered = extractedLayers.filter(layer => {
      const lowerLayer = layer.toLowerCase();
      switch(type) {
        case 'wp':
          return lowerLayer.includes('wp') && !lowerLayer.includes('inv'); // Include wp but exclude wp_inv
        case 'back': 
          return lowerLayer.startsWith('bk') || lowerLayer.includes('back');
        case 'front-base':
          return lowerLayer.includes('fr_cmyk') || (lowerLayer.startsWith('fr') && lowerLayer.includes('cmyk'));
        case 'front-parallel':
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
        .filter((textureName: string) => !textureName.toLowerCase().includes('wpc v')); // Filter out "wpc v"
    }
    return [];
  };

  const getWpInvLayers = () => {
    const extractedLayers = getExtractedLayers();
    return extractedLayers.filter(layer => 
      layer.toLowerCase().includes('wp') && layer.toLowerCase().includes('inv')
    );
  };

  const resetCurrentConfig = () => {
    setCurrentConfig({ chrome: false });
    setCurrentCardType(null);
    setEditingAssetId(null);
  };

  const addAsset = () => {
    if (!currentCardType || !currentConfig.layer) return;

    // For front-parallel cards, auto-select wp_inv layer if only one exists and VFX is selected
    let finalLayer = currentConfig.layer;
    if (currentCardType === 'front-parallel' && currentConfig.vfx && getWpInvLayers().length === 1) {
      finalLayer = getWpInvLayers()[0];
    }

    const newAsset: AssetConfig = {
      id: editingAssetId || Date.now().toString(),
      name: generateAssetName({
        ...currentConfig,
        type: currentCardType,
        layer: finalLayer
      } as AssetConfig),
      type: currentCardType,
      layer: finalLayer,
      spot: currentConfig.spot,
      color: currentConfig.color,
      vfx: currentConfig.vfx,
      chrome: (currentConfig.chrome && (currentCardType === 'front-base' || currentCardType === 'front-parallel') && getWpInvLayers().length > 0) || false // Chrome only for front cards with wp_inv layers
    };

    if (editingAssetId) {
      // Update existing asset
      setConfiguredAssets(prev => 
        prev.map(asset => asset.id === editingAssetId ? newAsset : asset)
      );
    } else {
      // Add new asset
      setConfiguredAssets(prev => [...prev, newAsset]);
    }

    resetCurrentConfig();
  };

  const generateAssetName = (config: AssetConfig): string => {
    const typeDisplay = config.type === 'front-base' ? 'BASE' : config.type === 'front-parallel' ? 'PARALLEL' : config.type.toUpperCase();
    const parts = [typeDisplay];
    
    if (config.spot) parts.push(config.spot);
    if (config.color) parts.push(config.color.name);
    if (config.chrome && (config.type === 'front-base' || config.type === 'front-parallel') && getWpInvLayers().length > 0) parts.push('Chrome'); // Chrome only for front cards with wp_inv layers
    
    return parts.join(' ');
  };

  const removeAsset = (id: string) => {
    setConfiguredAssets(prev => prev.filter(asset => asset.id !== id));
  };

  const editAsset = (asset: AssetConfig) => {
    setCurrentCardType(asset.type);
    setCurrentConfig(asset);
    setEditingAssetId(asset.id);
  };

  if (!isVisible) return null;

  const extractedLayers = getExtractedLayers();
  const colorVariants = getColorVariants();
  const canCreateAssets = configuredAssets.length > 0;

  return (
    <>
      <div style={{
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(147, 51, 234, 0.15))',
        border: '2px solid rgba(59, 130, 246, 0.3)',
        borderRadius: 16,
        padding: 24,
        marginBottom: 32,
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 16
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            flexShrink: 0
          }}>
            ⚡
          </div>
          <div>
            <h2 style={{
              fontSize: '1.4rem',
              fontWeight: 700,
              color: '#f8f8f8',
              margin: '0 0 8px 0'
            }}>
              🎯 Action Required: Configure Digital Assets
            </h2>
            <p style={{
              fontSize: '1rem',
              color: '#bfdbfe',
              margin: 0,
              lineHeight: 1.5
            }}>
              Your files have been successfully extracted! Now configure your digital assets by selecting a PSD template, color variants, and layers below.
            </p>
          </div>
        </div>

        {/* Configuration Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* PSD File Selection */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <label style={{
              fontSize: 16,
              fontWeight: 600,
              color: '#f8f8f8',
              minWidth: 120
            }}>
              Select PSD:
            </label>
            {loadingPhysicalFiles ? (
              <div style={{
                flex: 1,
                maxWidth: 400,
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <div style={{
                  width: 16,
                  height: 16,
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid #60a5fa',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <span style={{ color: '#9ca3af', fontSize: 14 }}>
                  Loading PSD templates...
                </span>
              </div>
            ) : (
              <select
                value={selectedPhysicalFile}
                onChange={(e) => setSelectedPhysicalFile(e.target.value)}
                disabled={loadingPhysicalFiles}
                style={{
                  flex: 1,
                  maxWidth: 400,
                  padding: '12px 16px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  color: '#f8f8f8',
                  fontSize: 14,
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
              >
                <option value="" style={{ background: '#1f2937', color: '#f8f8f8' }}>
                  Select PSD file...
                </option>
                {physicalJsonFiles.map((file, index) => {
                  const filename = file.name.split('/').pop() || file.name;
                  const displayName = filename.replace('.json', '');
                  return (
                    <option 
                      key={index} 
                      value={file.name} 
                      style={{ background: '#1f2937', color: '#f8f8f8' }}
                    >
                      {displayName}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {/* Loading JSON Data */}
          {selectedPhysicalFile && loadingJsonData && (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: 12,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              margin: '20px 0'
            }}>
              <div style={{
                width: 32,
                height: 32,
                border: '3px solid rgba(59, 130, 246, 0.3)',
                borderTop: '3px solid #3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px'
              }} />
              <div style={{
                color: '#9ca3af',
                fontSize: 14,
                marginBottom: 8
              }}>
                Loading PSD template data...
              </div>
            </div>
          )}

          {/* New Asset Builder UI */}
          {selectedPhysicalFile && jsonData && !loadingJsonData && (
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              {/* Left Side: Asset Configuration Panel */}
              <div style={{
                flex: '0 0 380px',
                minWidth: 320,
                maxWidth: 380,
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: 20
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
                    {(['wp', 'back', 'front-base', 'front-parallel'] as const).map(type => (
                      <button
                        key={type}
                        onClick={() => {
                          setCurrentCardType(type);
                          
                          if (type === 'front-parallel') {
                            // For front-parallel, auto-select spot layer
                            const spotLayers = getSpotLayers();
                            const autoSelectedSpot = spotLayers.length === 1 ? spotLayers[0] : '';
                            setCurrentConfig({ 
                              chrome: false,
                              type,
                              spot: autoSelectedSpot,
                              layer: autoSelectedSpot // Set layer to spot for front-parallel
                            });
                          } else {
                            // For other types, auto-select layer
                            const layersForType = getLayersByType(type);
                            const autoSelectedLayer = layersForType.length === 1 ? layersForType[0] : '';
                            setCurrentConfig({ 
                              chrome: false,
                              type,
                              layer: autoSelectedLayer
                            });
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
                        {type === 'front-base' ? 'BASE' : type === 'front-parallel' ? 'PARALLEL' : type.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dynamic Configuration based on Card Type */}
                {currentCardType && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Layer Selection */}
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#f8f8f8',
                        marginBottom: 8
                      }}>
                        {currentCardType === 'front-parallel' ? 'Step 2: Select Spot Layer' : 'Step 2: Select Layer'}
                        {(() => {
                          const layersForType = currentCardType === 'front-parallel' ? getSpotLayers() : getLayersByType(currentCardType);
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
                        value={currentCardType === 'front-parallel' ? (currentConfig.spot || '') : (currentConfig.layer || '')}
                        onChange={(e) => {
                          if (currentCardType === 'front-parallel') {
                            setCurrentConfig(prev => ({ ...prev, spot: e.target.value, layer: e.target.value }));
                          } else {
                            setCurrentConfig(prev => ({ ...prev, layer: e.target.value }));
                          }
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
                        <option value="" style={{ background: '#1f2937' }}>
                          {currentCardType === 'front-parallel' ? 'Select spot layer...' : 'Select layer...'}
                        </option>
                        {(currentCardType === 'front-parallel' ? getSpotLayers() : getLayersByType(currentCardType)).map(layer => (
                          <option key={layer} value={layer} style={{ background: '#1f2937' }}>
                            {layer}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Step 3: Color Selection (front-parallel + spot selected) */}
                    {currentCardType === 'front-parallel' && currentConfig.spot && (
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: 14,
                          fontWeight: 600,
                          color: '#f8f8f8',
                          marginBottom: 8
                        }}>
                          Step 3: Select Color
                        </label>
                        <select
                          value={currentConfig.color ? `${currentConfig.color.id}-${currentConfig.color.name}` : ''}
                          onChange={(e) => {
                            if (e.target.value) {
                              const [id, name] = e.target.value.split('-');
                              setCurrentConfig(prev => ({ 
                                ...prev, 
                                color: { id: parseInt(id), name } 
                              }));
                            } else {
                              setCurrentConfig(prev => ({ ...prev, color: undefined }));
                            }
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
                          <option value="" style={{ background: '#1f2937' }}>Select color...</option>
                          {colorVariants.map((colorLayer: any, index: number) => (
                            <option 
                              key={index} 
                              value={`${colorLayer.id}-${colorLayer.name}`} 
                              style={{ background: '#1f2937' }}
                            >
                              {colorLayer.name || `Color ${index + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Step 4: VFX Texture Selection (front-parallel + color selected + wp_inv layers exist) */}
                    {currentCardType === 'front-parallel' && currentConfig.color && getWpInvLayers().length > 0 && (
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: 14,
                          fontWeight: 600,
                          color: '#f8f8f8',
                          marginBottom: 8
                        }}>
                          Step 4: Select VFX Texture
                          {getWpInvLayers().length === 1 && (
                            <span style={{ 
                              fontSize: 12, 
                              color: '#9ca3af', 
                              fontWeight: 400,
                              marginLeft: 8 
                            }}>
                              (using {getWpInvLayers()[0]})
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
                        
                        {/* WP_INV Layer Selection - Only show when multiple wp_inv layers exist */}
                        {currentConfig.vfx && getWpInvLayers().length > 1 && (
                          <div style={{ marginTop: 12 }}>
                            <label style={{
                              display: 'block',
                              fontSize: 14,
                              fontWeight: 600,
                              color: '#f8f8f8',
                              marginBottom: 8
                            }}>
                              Step 5: Select WP_INV Layer
                            </label>
                            <select
                              value={currentConfig.layer || ''}
                              onChange={(e) => setCurrentConfig(prev => ({ ...prev, layer: e.target.value }))}
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

                    {/* Chrome Toggle - Only for front cards with wp_inv layers */}
                    {(currentCardType === 'front-base' || currentCardType === 'front-parallel') && getWpInvLayers().length > 0 && (
                      <div>
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
                            checked={currentConfig.chrome || false}
                            onChange={(e) => setCurrentConfig(prev => ({ ...prev, chrome: e.target.checked }))}
                            style={{ width: 16, height: 16 }}
                          />
                          Chrome Effect
                        </label>
                      </div>
                    )}

                    {/* Add Asset Button */}
                    <div>
                      {(() => {
                        // Validation logic for different card types
                        let canAdd = false;
                        let validationMessage = '';

                        if (!currentCardType) {
                          validationMessage = 'Select card type';
                        } else if (!currentConfig.layer) {
                          validationMessage = 'Select layer';
                        } else {
                          switch (currentCardType) {
                            case 'wp':
                            case 'back':
                            case 'front-base':
                              canAdd = true;
                              break;
                            case 'front-parallel':
                              if (!currentConfig.spot) {
                                validationMessage = 'Select spot layer';
                              } else if (!currentConfig.color) {
                                validationMessage = 'Select color';
                              } else if (getWpInvLayers().length > 0) {
                                if (!currentConfig.vfx) {
                                  validationMessage = 'Select VFX texture';
                                } else if (getWpInvLayers().length === 1) {
                                  canAdd = true; // Auto-select single wp_inv layer
                                } else if (getWpInvLayers().length > 1 && !currentConfig.layer) {
                                  validationMessage = 'Select wp_inv layer';
                                } else {
                                  canAdd = true;
                                }
                              } else {
                                canAdd = true; // No wp_inv layers required
                              }
                              break;
                          }
                        }

                        return (
                          <>
                            <button
                              onClick={addAsset}
                              disabled={!canAdd}
                              style={{
                                padding: '12px 24px',
                                background: !canAdd ? 'rgba(156, 163, 175, 0.3)' : 'linear-gradient(135deg, #10b981, #059669)',
                                border: 'none',
                                borderRadius: 8,
                                color: 'white',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: !canAdd ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                opacity: !canAdd ? 0.6 : 1
                              }}
                            >
                              {editingAssetId ? 'Update Asset' : 'Add Asset'}
                            </button>
                            {editingAssetId && (
                              <button
                                onClick={resetCurrentConfig}
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

              {/* Right Side: Configured Assets List */}
              <div style={{
                flex: 1,
                minWidth: 400,
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: 20
              }}>
                <h3 style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: '#f8f8f8',
                  margin: '0 0 16px 0'
                }}>
                  Assets to Generate ({configuredAssets.length})
                </h3>
                
                {configuredAssets.length > 0 ? (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(147, 51, 234, 0.05))',
                    borderRadius: 12,
                    overflow: 'hidden',
                    marginBottom: 20,
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                  }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead>
                        <tr style={{ 
                          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
                          borderBottom: '2px solid rgba(255, 255, 255, 0.1)'
                        }}>
                          <th style={{ padding: '10px 12px', textAlign: 'left', color: '#f8f8f8', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em' }}>TYPE</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', color: '#f8f8f8', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em' }}>LAYERS</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', color: '#f8f8f8', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em' }}>VFX</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', color: '#f8f8f8', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em' }}>CHROME</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', color: '#f8f8f8', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em' }}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {configuredAssets.map((asset, index) => {
                          return (
                            <tr key={asset.id} style={{ 
                              borderBottom: index < configuredAssets.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                              transition: 'background 0.2s',
                              background: index % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                            onMouseOut={(e) => e.currentTarget.style.background = index % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)'}
                            >
                              <td style={{ 
                                padding: '10px 12px', 
                                color: '#f8f8f8', 
                                fontSize: 12,
                                fontWeight: 500
                              }}>
                                <span style={{
                                  background: asset.type === 'wp' ? 'rgba(34, 197, 94, 0.2)' : 
                                             asset.type === 'back' ? 'rgba(168, 85, 247, 0.2)' :
                                             asset.type === 'front-base' ? 'rgba(59, 130, 246, 0.2)' :
                                             'rgba(236, 72, 153, 0.2)',
                                  color: asset.type === 'wp' ? '#86efac' : 
                                         asset.type === 'back' ? '#c084fc' :
                                         asset.type === 'front-base' ? '#93c5fd' :
                                         '#f9a8d4',
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  letterSpacing: '0.02em'
                                }}>
                                  {asset.type === 'front-base' ? 'BASE' : asset.type === 'front-parallel' ? 'PARALLEL' : asset.type.toUpperCase()}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', color: '#e5e7eb', fontSize: 12 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {asset.spot && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <code style={{
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                        fontSize: 11,
                                        fontFamily: 'monospace'
                                      }}>
                                        {asset.spot}
                                      </code>
                                      {asset.color && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <span style={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: '50%',
                                            background: (() => {
                                              const colorName = asset.color.name.toLowerCase();
                                              // Map common color names to actual colors
                                              if (colorName.includes('yellow')) return '#fbbf24';
                                              if (colorName.includes('gold')) return '#f59e0b';
                                              if (colorName.includes('silver')) return '#9ca3af';
                                              if (colorName.includes('pink')) return '#ec4899';
                                              if (colorName.includes('red')) return '#ef4444';
                                              if (colorName.includes('blue')) return '#3b82f6';
                                              if (colorName.includes('green')) return '#10b981';
                                              if (colorName.includes('purple')) return '#8b5cf6';
                                              if (colorName.includes('orange')) return '#f97316';
                                              if (colorName.includes('black')) return '#1f2937';
                                              if (colorName.includes('white')) return '#f8f8f8';
                                              if (colorName.includes('gray') || colorName.includes('grey')) return '#6b7280';
                                              // Default gradient for unknown colors
                                              return 'linear-gradient(135deg, #fbbf24, #f59e0b)';
                                            })(),
                                            display: 'inline-block',
                                            border: '1px solid rgba(255, 255, 255, 0.2)'
                                          }} />
                                          <span style={{ fontSize: 11, color: '#f8f8f8' }}>{asset.color.name}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {asset.layer && (!asset.spot || asset.spot !== asset.layer) && (
                                    <code style={{
                                      background: 'rgba(255, 255, 255, 0.05)',
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      fontSize: 11,
                                      fontFamily: 'monospace'
                                    }}>
                                      {asset.layer}
                                    </code>
                                  )}
                                                                </div>
                              </td>
                              <td style={{ padding: '10px 12px', color: '#e5e7eb', fontSize: 12 }}>
                                {asset.vfx ? (
                                  <span style={{
                                    background: 'rgba(147, 51, 234, 0.1)',
                                    color: '#c084fc',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    fontSize: 11
                                  }}>
                                    {asset.vfx}
                                  </span>
                                ) : (
                                  <span style={{ color: '#6b7280' }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                {asset.type === 'wp' || asset.type === 'back' || getWpInvLayers().length === 0 ? (
                                  <span style={{ color: '#6b7280' }}>—</span>
                                ) : (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    background: asset.chrome ? 'rgba(34, 197, 94, 0.2)' : 'rgba(156, 163, 175, 0.2)',
                                    color: asset.chrome ? '#86efac' : '#9ca3af',
                                    padding: '3px 8px',
                                    borderRadius: 12,
                                    fontSize: 10,
                                    fontWeight: 600
                                  }}>
                                    <span style={{
                                      width: 5,
                                      height: 5,
                                      borderRadius: '50%',
                                      background: asset.chrome ? '#86efac' : '#6b7280'
                                    }} />
                                    {asset.chrome ? 'ON' : 'OFF'}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                  <button
                                    onClick={() => editAsset(asset)}
                                    style={{
                                      width: 26,
                                      height: 26,
                                      background: 'rgba(59, 130, 246, 0.1)',
                                      border: '1px solid rgba(59, 130, 246, 0.2)',
                                      borderRadius: 6,
                                      color: '#60a5fa',
                                      fontSize: 12,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'all 0.2s',
                                      position: 'relative',
                                      overflow: 'hidden'
                                    }}
                                    onMouseOver={(e) => {
                                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                                      e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                                      e.currentTarget.style.transform = 'scale(1.05)';
                                    }}
                                    onMouseOut={(e) => {
                                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                                      e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.2)';
                                      e.currentTarget.style.transform = 'scale(1)';
                                    }}
                                    title="Edit asset"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => removeAsset(asset.id)}
                                    style={{
                                      width: 26,
                                      height: 26,
                                      background: 'rgba(239, 68, 68, 0.1)',
                                      border: '1px solid rgba(239, 68, 68, 0.2)',
                                      borderRadius: 6,
                                      color: '#ef4444',
                                      fontSize: 12,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseOver={(e) => {
                                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                                      e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                                      e.currentTarget.style.transform = 'scale(1.05)';
                                    }}
                                    onMouseOut={(e) => {
                                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                      e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                                      e.currentTarget.style.transform = 'scale(1)';
                                    }}
                                    title="Remove asset"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{
                    textAlign: 'center',
                    padding: '48px 24px',
                    color: '#9ca3af',
                    fontSize: 14,
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.03), rgba(147, 51, 234, 0.03))',
                    borderRadius: 12,
                    border: '1px dashed rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                      fontSize: 24
                    }}>
                      📋
                    </div>
                    <div style={{ fontStyle: 'italic', marginBottom: 8 }}>
                      No assets configured yet
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 13 }}>
                      Use the form on the left to add assets
                    </div>
                  </div>
                )}

                {/* Generate All Assets Button */}
                {configuredAssets.length > 0 && (
                  <button
                    onClick={createAssets}
                    disabled={creatingAssets || !canCreateAssets}
                    style={{
                      width: '100%',
                      padding: '16px 32px',
                      background: creatingAssets 
                        ? 'rgba(156, 163, 175, 0.5)' 
                        : 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      borderRadius: 12,
                      color: 'white',
                      fontSize: 16,
                      fontWeight: 600,
                      cursor: creatingAssets ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: creatingAssets ? 'none' : '0 8px 24px rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    {creatingAssets ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <div style={{
                          width: 16,
                          height: 16,
                          border: '2px solid rgba(255, 255, 255, 0.3)',
                          borderTop: '2px solid white',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite'
                        }} />
                        Creating Assets...
                      </div>
                    ) : (
                      `🎨 Generate All Assets (${configuredAssets.length})`
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}; 