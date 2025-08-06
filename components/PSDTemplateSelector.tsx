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
  onJobDataUpdate?: (updatedJobData: any) => void; // Callback to update parent component's job data
}

// For multiple spot/color selections in parallel mode
interface SpotColorPair {
  spot: string;
  color?: string;
}

interface AssetConfig {
  id: string;
  type: 'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel' | 'wp-1of1';
  layer: string;
  spot?: string;
  color?: string;
  spotColorPairs?: SpotColorPair[]; // For PARALLEL cards with multiple combinations
  vfx?: string;
  chrome: string | boolean;
  oneOfOneWp?: boolean; // For BASE assets with superfractor chrome
}

export const PSDTemplateSelector = ({ jobData, mergedJobData, isVisible, creatingAssets, setCreatingAssets, onJobDataUpdate }: PSDTemplateSelectorProps) => {
  const router = useRouter();
  
  // State management
  const [physicalJsonFiles, setPhysicalJsonFiles] = useState<PSDFile[]>([]);
  const [loadingPhysicalFiles, setLoadingPhysicalFiles] = useState(false);
  const [selectedPhysicalFile, setSelectedPhysicalFile] = useState<string>('');
  const [jsonData, setJsonData] = useState<any>(null);
  const [loadingJsonData, setLoadingJsonData] = useState(false);
  
  // New asset configuration state
  const [currentCardType, setCurrentCardType] = useState<'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel' | 'wp-1of1' | null>(null);
  const [currentConfig, setCurrentConfig] = useState<Partial<AssetConfig>>({
    chrome: false,
    oneOfOneWp: false
  });
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [savingAsset, setSavingAsset] = useState(false);
  
  const [spotColorPairs, setSpotColorPairs] = useState<SpotColorPair[]>([{ spot: '', color: undefined }]);

  // Fetch physical JSON files when component becomes visible
  useEffect(() => {
    if (isVisible) {
      fetchPhysicalJsonFiles();
    }
  }, [isVisible]);

  // Auto-select PSD file when only one option is available
  useEffect(() => {
    if (physicalJsonFiles.length === 1 && !selectedPhysicalFile && !loadingPhysicalFiles) {
      const singleFile = physicalJsonFiles[0].name;
      console.log('🔄 Auto-selecting single PSD file:', singleFile);
      setSelectedPhysicalFile(singleFile);
    }
  }, [physicalJsonFiles, selectedPhysicalFile, loadingPhysicalFiles]);

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
      const assets = configuredAssets.map(asset => {
        if (asset.type === 'parallel' || asset.type === 'multi-parallel') {
          // Handle parallel/multi-parallel with spot color pairs
          const basePayload: any = {
            type: asset.type,
            spot_color_pairs: asset.spotColorPairs?.map(pair => ({
              spot: pair.spot,
              color: pair.color
            }))
          };

          // Add optional properties only if they exist and are needed
          if (asset.vfx || asset.chrome) {
            if (asset.vfx) {
              basePayload.vfx = asset.vfx;
            }
            if (asset.chrome) {
              basePayload.chrome = asset.chrome;
            }
            if (asset.layer) {
              basePayload.wp_inv_layer = asset.layer;
            }
          }

          return basePayload;
        } else {
          // Other card types (wp, back, base)
          const basePayload: any = {
            type: asset.type
          };

          // Add layer only if it exists
          if (asset.layer) {
            basePayload.layer = asset.layer;
          }

          // Add VFX if it exists for any card type
          if (asset.vfx) {
            basePayload.vfx = asset.vfx;
            // For base with VFX, we need wp_inv_layer
            if (asset.type === 'base') {
              const wpInvLayers = getWpInvLayers();
              if (wpInvLayers.length > 0) {
                basePayload.wp_inv_layer = wpInvLayers[0];
              }
            }
          }

          // For base, add chrome and wp_inv_layer if chrome is enabled
          if (asset.type === 'base' && asset.chrome) {
            basePayload.chrome = asset.chrome;
            const wpInvLayers = getWpInvLayers();
            if (wpInvLayers.length > 0) {
              basePayload.wp_inv_layer = wpInvLayers[0];
            }
          }

          // Add oneOfOneWp field if set (for base with superfractor chrome)
          if (asset.oneOfOneWp) {
            basePayload.oneOfOneWp = asset.oneOfOneWp;
          }

          return basePayload;
        }
      });

      const payload = {
        assets,
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
    
    // Return all extracted layers without filtering
    const allLayers = Array.from(extractedLayerNames);
    
    console.log('🔍 Total extracted layers:', allLayers.length);
    
    return allLayers.sort();
  };

  const getColorVariants = () => {
    // Get all spot groups
    const spotGroups = jsonData?.layers?.filter((layer: any) => 
      layer.name?.toLowerCase().includes('spot group')
    ) || [];
    
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
    
    // Map each spot group to its colors
    return spotGroups.map((group, index) => ({
      groupName: `SPOT GROUP ${index + 1}`,
      colors: collectSolidColorLayers(group)
    }));
  };

  // Helper functions for new UI
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

  // Helper function to get assets from job data
  const getConfiguredAssets = (): AssetConfig[] => {
    console.log('🔍 getConfiguredAssets called:', {
      hasMergedJobData: !!mergedJobData,
      hasAssets: !!mergedJobData?.assets,
      assetsType: typeof mergedJobData?.assets,
      assetsKeys: mergedJobData?.assets ? Object.keys(mergedJobData.assets) : [],
      fullMergedJobData: mergedJobData
    });
    
    if (!mergedJobData?.assets) return [];
    
    const assets = Object.entries(mergedJobData.assets).map(([assetId, assetData]: [string, any]) => ({
      id: assetId,
      type: assetData.type || 'wp',
      layer: assetData.layer || '',
      spot: assetData.spot,
      color: assetData.color,
      spotColorPairs: assetData.spotColorPairs || [],
      vfx: assetData.vfx,
      chrome: assetData.chrome || false,
      oneOfOneWp: assetData.oneOfOneWp || false
    }));
    
    console.log('✅ Parsed assets:', assets);
    return assets;
  };

  const resetCurrentConfig = () => {
    setCurrentConfig({ chrome: false, oneOfOneWp: false });
    setCurrentCardType(null);
    setEditingAssetId(null);
    setSpotColorPairs([{ spot: '', color: undefined }]);
  };

  const addAsset = async () => {
    if (!currentCardType || !jobData?.job_id || savingAsset) return;
    
    setSavingAsset(true);
    
    try {
      // Build asset configuration
      let assetConfig: any = {
        type: currentCardType
      };
      
      // Only include chrome if it has a value
      if (currentConfig.chrome) {
        assetConfig.chrome = currentConfig.chrome;
      }

      // Include oneOfOneWp if it's set
      if (currentConfig.oneOfOneWp) {
        assetConfig.oneOfOneWp = currentConfig.oneOfOneWp;
      }

      // Handle parallel/multi-parallel with multiple spot/color pairs
      if (currentCardType === 'parallel' || currentCardType === 'multi-parallel') {
        const validPairs = spotColorPairs.filter(pair => pair.spot && pair.color);
        if (validPairs.length === 0) return;
        
        // For parallel/multi-parallel cards, auto-select wp_inv layer if only one exists
        let finalLayer = currentConfig.layer || validPairs[0].spot;
        if (getWpInvLayers().length === 1) {
          finalLayer = getWpInvLayers()[0];
        } else if (getWpInvLayers().length > 1 && currentConfig.layer) {
          finalLayer = currentConfig.layer;
        }

        assetConfig = {
          ...assetConfig,
          layer: finalLayer,
          spotColorPairs: validPairs,
          vfx: currentConfig.vfx
        };
      } else {
        // Handle other card types
        if (!currentConfig.layer) return;
        
        assetConfig = {
          ...assetConfig,
          layer: currentConfig.layer,
          spot: currentConfig.spot,
          color: currentConfig.color,
          vfx: currentConfig.vfx
        };
      }

      // Asset payload without name field - backend will generate ID and manage names
      const assetPayload = {
        ...assetConfig
      };

      let response;
      if (editingAssetId) {
        // Update existing asset
        response = await contentPipelineApi.updateAsset(jobData.job_id, editingAssetId, assetPayload);
      } else {
        // Create new asset - backend will generate ID and store this config
        response = await contentPipelineApi.createAsset(jobData.job_id, assetPayload);
        
        // If creating a new BASE asset with superfractor chrome, also create a wp-1of1 version
        if (response.success && currentCardType === 'base' && currentConfig.chrome === 'superfractor' && currentConfig.oneOfOneWp) {
          console.log('🎯 Creating additional wp-1of1 asset for BASE + superfractor...');
          
          // Get WP layers for the wp-1of1 asset
          const wpLayers = getLayersByType('wp');
          if (wpLayers.length > 0) {
            const wp1of1Payload = {
              type: 'wp-1of1',
              layer: wpLayers[0] // Use first available WP layer - no VFX or chrome like regular wp
            };
            
            try {
              const wp1of1Response = await contentPipelineApi.createAsset(jobData.job_id, wp1of1Payload);
              console.log('✅ wp-1of1 asset created for BASE + superfractor:', wp1of1Response);
            } catch (wp1of1Error) {
              console.error('❌ Error creating wp-1of1 asset:', wp1of1Error);
              // Don't fail the main asset creation if wp-1of1 fails
            }
          }
        }
      }

      if (response.success) {
        console.log('✅ Asset saved successfully:', {
          success: response.success,
          hasJob: !!response.job,
          jobAssets: response.job?.assets ? Object.keys(response.job.assets) : 'no job data returned',
          fullResponse: response
        });
        
        if (response.job && onJobDataUpdate) {
          console.log('🔄 Calling onJobDataUpdate with job data from response');
          onJobDataUpdate(response.job);
        } else if (onJobDataUpdate) {
          console.log('🔄 No job data in response, triggering refetch to get updated asset list');
          // Asset created successfully but no job data returned - trigger a refetch
          // We'll pass a special signal to force a refetch
          onJobDataUpdate({ _forceRefetch: true, job_id: jobData.job_id });
        }
      } else {
        console.log('❌ Asset creation failed:', {
          success: response.success,
          hasJob: !!response.job,
          hasCallback: !!onJobDataUpdate,
          response: response
        });
      }
      
      resetCurrentConfig();
    } catch (error) {
      console.error('❌ Error saving asset:', error);
      alert(`Failed to save asset: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSavingAsset(false);
    }
  };



  const removeAsset = async (id: string) => {
    if (!jobData?.job_id || savingAsset) return;
    
    setSavingAsset(true);
    
    try {
      console.log('🗑️ Removing asset:', id);
      const response = await contentPipelineApi.deleteAsset(jobData.job_id, id);
      
      if (response.success) {
        console.log('✅ Asset removed successfully:', {
          success: response.success,
          hasJob: !!response.job,
          fullResponse: response
        });
        
        if (response.job && onJobDataUpdate) {
          console.log('🔄 Calling onJobDataUpdate with job data from delete response');
          onJobDataUpdate(response.job);
        } else if (onJobDataUpdate) {
          console.log('🔄 No job data in delete response, triggering refetch to get updated asset list');
          // Asset deleted successfully but no job data returned - trigger a refetch
          onJobDataUpdate({ _forceRefetch: true, job_id: jobData.job_id });
        }
      } else {
        console.log('❌ Asset deletion failed:', {
          success: response.success,
          response: response
        });
      }
    } catch (error) {
      console.error('❌ Error removing asset:', error);
      alert(`Failed to remove asset: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSavingAsset(false);
    }
  };

  const editAsset = (asset: AssetConfig) => {
    setCurrentCardType(asset.type);
    setCurrentConfig(asset);
    setEditingAssetId(asset.id);
    
    // For parallel assets, populate the spot/color pairs
    if (asset.type === 'parallel' || asset.type === 'multi-parallel') {
      if (asset.spotColorPairs && asset.spotColorPairs.length > 0) {
        // New format with multiple pairs
        setSpotColorPairs(asset.spotColorPairs);
      } else if (asset.spot && asset.color) {
        // Legacy format with single spot/color
        setSpotColorPairs([{
          spot: asset.spot,
          color: asset.color
        }]);
      }
      // Clear spot/color from current config since it's in the pairs
      setCurrentConfig(prev => ({ ...prev, spot: undefined, color: undefined }));
    }
  };

  const handleEDRPdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('📋 EDR PDF Upload initiated:', file.name);

    try {
      // Convert file to base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove the data:application/pdf;base64, prefix to get just the base64 data
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      console.log('📋 File converted to base64, size:', base64Data.length, 'characters');

      // Prepare API request
      const requestPayload = {
        pdf_data: base64Data,
        filename: file.name
      };

      console.log('📋 Calling content pipeline API /pdf-extract:', {
        filename: file.name,
        base64Length: base64Data.length
      });

      // Call the content pipeline API
      const response = await contentPipelineApi.extractPdfData(requestPayload);

      console.log('✅ PDF Extract API Response:', response);
      console.log('📋 Full JSON Response:', JSON.stringify(response, null, 2));

    } catch (error) {
      console.error('❌ Error uploading EDR PDF:', error);
      alert(`Failed to process PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Clear the input value so the same file can be selected again
    event.target.value = '';
  };

  if (!isVisible) return null;

  const extractedLayers = getExtractedLayers();
  const colorVariants = getColorVariants();
  const configuredAssets = getConfiguredAssets();
  const canCreateAssets = configuredAssets.length > 0;

  // Debug when component re-renders due to asset changes
  console.log('🔍 PSDTemplateSelector render:', {
    configuredAssetsCount: configuredAssets.length,
    configuredAssetIds: configuredAssets.map(a => a.id),
    timestamp: new Date().toISOString()
  });

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
              ⚡ Action Required: Configure Digital Assets
            </h2>
            <p style={{
              fontSize: '1rem',
              color: '#bfdbfe',
              margin: 0,
              lineHeight: 1.5
            }}>
              Configure your digital assets by selecting a PSD template and configuring card types, layers, and colors below.
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
                  {physicalJsonFiles.length === 1 ? 'Auto-selected PSD file...' : 'Select PSD file...'}
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
                          
                                      if (type === 'parallel' || type === 'multi-parallel') {
              // For parallel/multi-parallel, initialize with one empty pair
                            setSpotColorPairs([{ spot: '', color: undefined }]);
                            setCurrentConfig({ 
                              chrome: false,
                              type,
                              spot: '',
                              layer: ''
                            });
                          } else {
                            // For other types, clear spot/color pairs
                            setSpotColorPairs([]);
                            const layersForType = getLayersByType(type);
                            const autoSelectedLayer = layersForType.length === 1 ? layersForType[0] : '';
                            setCurrentConfig({ 
                              chrome: false,
                              oneOfOneWp: false,
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
                              onMouseOver={(e) => {
                                if (spotColorPairs[0]?.spot && spotColorPairs.length < 3) {
                                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.3)';
                                  e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.6)';
                                }
                              }}
                              onMouseOut={(e) => {
                                if (spotColorPairs[0]?.spot && spotColorPairs.length < 3) {
                                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)';
                                  e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.4)';
                                }
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
                                      {(colorLayer.name || `Color ${idx + 1}`).replace(/\d+$/, '')}
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

                    {/* Step 3: VFX Texture Selection */}
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
                        
                        {/* WP_INV Layer Selection - Only show when multiple wp_inv layers exist */}
                        {(currentCardType === 'parallel' || currentCardType === 'multi-parallel') && getWpInvLayers().length > 1 && (
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

                    {/* Add Asset Button */}
                    <div>
                      {(() => {
                        // Validation logic for different card types
                        let canAdd = false;
                        let validationMessage = '';

                        if (!currentCardType) {
                          validationMessage = 'Select card type';
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
                              if (validPairs.length === 0) {
                                validationMessage = 'Select at least one spot layer and color';
                              } else if (getWpInvLayers().length > 1 && !currentConfig.layer) {
                                // Only require wp_inv layer selection if there are multiple
                                validationMessage = 'Select wp_inv layer';
                              } else {
                                canAdd = true; // Have at least one valid spot/color pair
                              }
                              break;
                          }
                        }

                        return (
                          <>
                            <button
                              onClick={addAsset}
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
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16
                }}>
                  <h3 style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#f8f8f8',
                    margin: 0
                  }}>
                    Assets to Generate ({configuredAssets.length})
                  </h3>
                  <button
                    onClick={() => document.getElementById('edr-pdf-input')?.click()}
                    disabled={savingAsset || creatingAssets}
                    style={{
                      padding: '8px 16px',
                      background: (savingAsset || creatingAssets)
                        ? 'rgba(156, 163, 175, 0.3)'
                        : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                      border: 'none',
                      borderRadius: 8,
                      color: 'white',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: (savingAsset || creatingAssets) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      opacity: (savingAsset || creatingAssets) ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                    onMouseEnter={(e) => {
                      if (!savingAsset && !creatingAssets) {
                        e.currentTarget.style.transform = 'scale(1.02)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!savingAsset && !creatingAssets) {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    📋 Import from EDR
                  </button>
                  <input
                    id="edr-pdf-input"
                    type="file"
                    accept=".pdf"
                    style={{ display: 'none' }}
                    onChange={handleEDRPdfUpload}
                  />
                </div>
                
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
                                              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#f8f8f8', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em' }}>TYPE</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#f8f8f8', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em' }}>LAYERS</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#f8f8f8', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em' }}>VFX</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', color: '#f8f8f8', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em' }}>CHROME</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', color: '#f8f8f8', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em' }}>ACTIONS</th>
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
                                             asset.type === 'base' ? 'rgba(59, 130, 246, 0.2)' :
                                             'rgba(236, 72, 153, 0.2)',
                                  color: asset.type === 'wp' ? '#86efac' : 
                                         asset.type === 'back' ? '#c084fc' :
                                         asset.type === 'base' ? '#93c5fd' :
                                         '#f9a8d4',
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  letterSpacing: '0.02em'
                                }}>
                                  {asset.type === 'base' ? 'BASE' : asset.type === 'parallel' ? 'PARALLEL' : asset.type === 'multi-parallel' ? 'MULTI-PARALLEL' : asset.type === 'wp-1of1' ? 'WP-1OF1' : asset.type.toUpperCase()}
                            </span>
                              </td>
                              <td style={{ padding: '10px 12px', color: '#e5e7eb', fontSize: 13 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {/* Handle multiple spot/color pairs for PARALLEL/MULTI-PARALLEL */}
                                  {asset.spotColorPairs && asset.spotColorPairs.length > 0 ? (
                                    asset.spotColorPairs.map((pair, idx) => (
                                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <code style={{
                                          padding: '2px 6px',
                                          borderRadius: 4,
                                          fontSize: 13,
                                          fontFamily: 'monospace'
                                        }}>
                                          {pair.spot}
                                        </code>
                                        {pair.color && (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{
                                              width: 10,
                                              height: 10,
                                              borderRadius: '50%',
                                              background: (() => {
                                                const colorName = (pair.color || '').replace(/\d+$/, '').toLowerCase();
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
                                            <span style={{ fontSize: 13, color: '#f8f8f8' }}>
                                              {(pair.color || '').replace(/\d+$/, '')}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    /* Legacy single spot/color display */
                                    <>
                                      {asset.spot && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <code style={{
                                            padding: '2px 6px',
                                            borderRadius: 4,
                                            fontSize: 13,
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
                                                  const colorName = (asset.color || '').replace(/\d+$/, '').toLowerCase();
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
                                              <span style={{ fontSize: 13, color: '#f8f8f8' }}>
                                                {(asset.color || '').replace(/\d+$/, '')}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  )}
                                  {asset.layer && (!asset.spotColorPairs || asset.spotColorPairs.length === 0) && (!asset.spot || asset.spot !== asset.layer) && (
                                    <code style={{
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      fontSize: 13,
                                      fontFamily: 'monospace'
                                    }}>
                                      {asset.layer}
                                    </code>
                                  )}
                                                                </div>
                              </td>
                              <td style={{ padding: '10px 12px', color: '#e5e7eb', fontSize: 13 }}>
                                {asset.vfx ? (
                                  <span style={{
                                    background: 'rgba(147, 51, 234, 0.1)',
                                    color: '#c084fc',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    fontSize: 12
                                  }}>
                                    {asset.vfx}
                                  </span>
                                ) : (
                                  <span style={{ color: '#6b7280' }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                {asset.type === 'wp' || asset.type === 'back' || asset.type === 'wp-1of1' || getWpInvLayers().length === 0 ? (
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
                                    fontSize: 11,
                                    fontWeight: 600
                                  }}>
                                    <span style={{
                                      width: 5,
                                      height: 5,
                                      borderRadius: '50%',
                                      background: asset.chrome ? '#86efac' : '#6b7280'
                                    }} />
                                    {asset.chrome ? (typeof asset.chrome === 'string' ? asset.chrome.toUpperCase() : 'ON') : 'OFF'}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                  <button
                                    onClick={() => editAsset(asset)}
                                    disabled={savingAsset}
                                    style={{
                                      width: 26,
                                      height: 26,
                                      background: savingAsset ? 'rgba(156, 163, 175, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                      border: '1px solid ' + (savingAsset ? 'rgba(156, 163, 175, 0.2)' : 'rgba(59, 130, 246, 0.2)'),
                                      borderRadius: 6,
                                      color: savingAsset ? '#9ca3af' : '#60a5fa',
                                      fontSize: 14,
                                      cursor: savingAsset ? 'not-allowed' : 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'all 0.2s',
                                      position: 'relative',
                                      overflow: 'hidden',
                                      opacity: savingAsset ? 0.5 : 1
                                    }}
                                    onMouseOver={(e) => {
                                      if (!savingAsset) {
                                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                                        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                                        e.currentTarget.style.transform = 'scale(1.05)';
                                      }
                                    }}
                                    onMouseOut={(e) => {
                                      if (!savingAsset) {
                                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                                        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.2)';
                                        e.currentTarget.style.transform = 'scale(1)';
                                      }
                                    }}
                                    title={savingAsset ? "Saving..." : "Edit asset"}
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => removeAsset(asset.id)}
                                    disabled={savingAsset}
                                    style={{
                                      width: 26,
                                      height: 26,
                                      background: savingAsset ? 'rgba(156, 163, 175, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                      border: '1px solid ' + (savingAsset ? 'rgba(156, 163, 175, 0.2)' : 'rgba(239, 68, 68, 0.2)'),
                                      borderRadius: 6,
                                      color: savingAsset ? '#9ca3af' : '#ef4444',
                                      fontSize: 14,
                                      cursor: savingAsset ? 'not-allowed' : 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'all 0.2s',
                                      opacity: savingAsset ? 0.5 : 1
                                    }}
                                    onMouseOver={(e) => {
                                      if (!savingAsset) {
                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                                        e.currentTarget.style.transform = 'scale(1.05)';
                                      }
                                    }}
                                    onMouseOut={(e) => {
                                      if (!savingAsset) {
                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                                        e.currentTarget.style.transform = 'scale(1)';
                                      }
                                    }}
                                    title={savingAsset ? "Saving..." : "Remove asset"}
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