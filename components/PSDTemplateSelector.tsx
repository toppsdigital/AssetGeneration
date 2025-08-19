'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDataStore } from '../hooks/useAppDataStore';
import { AssetCreationForm } from './AssetCreationForm';
import { AssetsTable } from './AssetsTable';

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
}

export const PSDTemplateSelector = ({ jobData, mergedJobData, isVisible, creatingAssets, setCreatingAssets, onJobDataUpdate }: PSDTemplateSelectorProps) => {
  const router = useRouter();
  
  // Use centralized data store for asset operations only (no data fetching)
  const { 
    mutate: assetMutation
  } = useAppDataStore('jobAssets', { 
    jobId: '', // Don't auto-fetch assets - we'll use mergedJobData.assets from props
    autoRefresh: false 
  });
  
  // State management
  const [physicalJsonFiles, setPhysicalJsonFiles] = useState<PSDFile[]>([]);
  const [loadingPhysicalFiles, setLoadingPhysicalFiles] = useState(false);
  const [selectedPhysicalFile, setSelectedPhysicalFile] = useState<string>('');
  const [jsonData, setJsonData] = useState<any>(null);
  const [loadingJsonData, setLoadingJsonData] = useState(false);
  
  // New asset configuration state
  const [currentCardType, setCurrentCardType] = useState<'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel' | 'wp-1of1' | 'front' | null>(null);
  const [currentConfig, setCurrentConfig] = useState<Partial<AssetConfig>>({
    chrome: false,
    oneOfOneWp: false,
    name: '',
    wp_inv_layer: ''
  });
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingAsset, setEditingAsset] = useState<AssetConfig | null>(null);
  const [savingAsset, setSavingAsset] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [processingPdf, setProcessingPdf] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [spot_color_pairs, setSpot_color_pairs] = useState<SpotColorPair[]>([{ spot: '', color: undefined }]);

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

  // Fetch physical JSON files when component becomes visible
  useEffect(() => {
    console.log('🔍 PSDTemplateSelector useEffect triggered:', {
      isVisible,
      hasJobId: !!mergedJobData?.job_id,
      jobId: mergedJobData?.job_id
    });
    
    if (isVisible) {
      fetchPhysicalJsonFiles();
      console.log('✅ PSDTemplateSelector visible - using assets from props (no additional API calls)');
    } else {
      console.log(`ℹ️ PSDTemplateSelector not visible for job ${mergedJobData?.job_id} - status '${mergedJobData?.job_status}'`);
    }
  }, [isVisible, mergedJobData?.job_id]);

  // Debug mergedJobData changes
  useEffect(() => {
    console.log('🔍 mergedJobData changed in PSDTemplateSelector:', {
      timestamp: new Date().toISOString(),
      hasMergedJobData: !!mergedJobData,
      jobId: mergedJobData?.job_id,
      hasAssets: !!mergedJobData?.assets,
      assetsCount: mergedJobData?.assets ? Object.keys(mergedJobData.assets).length : 0,
      assetIds: mergedJobData?.assets ? Object.keys(mergedJobData.assets) : []
    });
  }, [mergedJobData]);

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
    if (!mergedJobData?.assets || Object.keys(mergedJobData.assets).length === 0) return;

    console.log('🎨 Creating digital assets with job assets:', {
      selectedFile: selectedPhysicalFile,
      psdFile: jsonData?.psd_file,
      jobAssets: mergedJobData.assets,
      totalAssets: Object.keys(mergedJobData.assets).length,
    });

    setCreatingAssets(true);

    try {
      const psdFile = selectedPhysicalFile.split('/').pop()?.replace('.json', '.psd') || '';
      
      // Convert job assets object to array format for API
      const assets = Object.values(mergedJobData.assets) as any[];

      const payload = {
        assets,
        psd_file: psdFile
      };

      console.log('📋 API Payload:', {
        ...payload,
        assetsCount: assets.length,
        assetsPreview: assets.map((asset: any) => ({ name: asset.name, type: asset.type }))
      });

      const response = await assetMutation({
        type: 'generateAssets',
        jobId: jobData!.job_id!,
        data: payload
      });
      
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

  const getColorRgbByName = (colorName: string): string => {
    const color = HARDCODED_COLORS.find(c => 
      c.name.toLowerCase() === colorName.toLowerCase()
    );
    return color?.rgb || 'R153G153B153'; // Default gray for unknown colors
  };

  const getColorNameByRgb = (rgbValue: string): string => {
    const color = HARDCODED_COLORS.find(c => c.rgb === rgbValue);
    return color?.name || 'Unknown';
  };

  // Helper function to get assets from job data
  const getConfiguredAssets = (): AssetConfig[] => {
    console.log('🔍 getConfiguredAssets called:', {
      timestamp: new Date().toISOString(),
      hasMergedJobData: !!mergedJobData,
      hasAssets: !!mergedJobData?.assets,
      assetsType: typeof mergedJobData?.assets,
      assetsKeys: mergedJobData?.assets ? Object.keys(mergedJobData.assets) : [],
      assetsCount: mergedJobData?.assets ? Object.keys(mergedJobData.assets).length : 0,
      mergedJobDataKeys: mergedJobData ? Object.keys(mergedJobData) : [],
      jobId: mergedJobData?.job_id
    });
    
    if (!mergedJobData?.assets) {
      console.log('❌ No assets found in mergedJobData, returning empty array');
      return [];
    }
    
    const assets = Object.entries(mergedJobData.assets).map(([assetId, assetData]: [string, any]) => ({
      id: assetId,
      name: assetData.name || assetData.type?.toUpperCase() || 'UNNAMED',
      type: assetData.type || 'wp',
      layer: assetData.layer || '',
      spot: assetData.spot,
      color: assetData.color,
      spot_color_pairs: assetData.spot_color_pairs || [],
      vfx: assetData.vfx,
      chrome: assetData.chrome || false,
      oneOfOneWp: assetData.oneOfOneWp || false,
      wp_inv_layer: assetData.wp_inv_layer || ''
    }));
    
    console.log('✅ Parsed assets from mergedJobData.assets:', {
      count: assets.length,
      assetIds: assets.map(a => a.id),
      assetNames: assets.map(a => a.name),
      assetTypes: assets.map(a => a.type)
    });
    return assets;
  };

  const generateAssetName = (type: string, config: Partial<AssetConfig>, existingNames?: string[]): string => {
    let nameParts: string[] = [];
    
    // Start with simple lowercase type names
    if (type === 'wp' || type === 'wp-1of1') {
      nameParts.push('wp');
    } else if (type === 'back') {
      nameParts.push('back');
    } else if (type === 'base') {
      nameParts.push('base');
    } else if (type === 'parallel') {
      // For parallel, add color names with spot suffixes
      if (config.spot_color_pairs && config.spot_color_pairs.length > 0) {
        const colorParts = config.spot_color_pairs
          .filter(pair => pair.spot && pair.color)
          .map((pair, index) => {
            const colorName = pair.color?.toLowerCase() || '';
            // Extract spot number from spot name (like spot1 -> 1, or use auto)
            const spotMatch = pair.spot?.match(/spot(\d+)/i);
            const spotSuffix = spotMatch ? spotMatch[1] : 'auto';
            return `${colorName}${spotSuffix}`;
          });
        
        if (colorParts.length > 0) {
          nameParts.push(...colorParts);
        } else {
          nameParts.push('parallel');
        }
      } else {
        nameParts.push('parallel');
      }
      
      // Add VFX for parallel if present
      if (config.vfx) {
        const cleanVfx = config.vfx.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
        console.log('🔍 Adding VFX to parallel name:', config.vfx, '→', cleanVfx);
        nameParts.push(cleanVfx);
      }
    } else if (type === 'multi-parallel') {
      // For multi-parallel, add color names with spot suffixes
      if (config.spot_color_pairs && config.spot_color_pairs.length > 0) {
        const colorParts = config.spot_color_pairs
          .filter(pair => pair.spot && pair.color)
          .map((pair, index) => {
            const colorName = pair.color?.toLowerCase() || '';
            // Extract spot number from spot name (like spot1 -> 1, or use auto)
            const spotMatch = pair.spot?.match(/spot(\d+)/i);
            const spotSuffix = spotMatch ? spotMatch[1] : 'auto';
            return `${colorName}${spotSuffix}`;
          });
        
        if (colorParts.length > 0) {
          nameParts.push(...colorParts);
        } else {
          nameParts.push('multiparallel');
        }
      } else {
        nameParts.push('multiparallel');
      }
      
      // Add VFX for multi-parallel if present
      if (config.vfx) {
        const cleanVfx = config.vfx.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
        console.log('🔍 Adding VFX to multi-parallel name:', config.vfx, '→', cleanVfx);
        nameParts.push(cleanVfx);
      }
    }
    
    // Add VFX for base card type if present
    if (type === 'base' && config.vfx) {
      const cleanVfx = config.vfx.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
      nameParts.push(cleanVfx);
    }
    
    // Add chrome info - only include superfractor in name
    if (config.chrome && config.chrome === 'superfractor') {
      console.log('🔍 Adding superfractor to name:', config.chrome);
      nameParts.push('superfractor');
    }
    
    // Join with underscores
    console.log('🔍 Final name parts before joining:', nameParts);
    let baseName = nameParts.join('_');
    console.log('🔍 Generated base name:', baseName);
    
    // Check for duplicates and add number suffix if needed
    if (existingNames && existingNames.length > 0) {
      let finalName = baseName;
      let counter = 1;
      
      while (existingNames.some(name => name.toLowerCase() === finalName.toLowerCase())) {
        finalName = `${baseName}_${counter}`;
        counter++;
      }
      
      return finalName;
    }
    
    return baseName;
  };

  const resetCurrentConfig = () => {
    setCurrentConfig({ chrome: false, oneOfOneWp: false, name: '', wp_inv_layer: '' });
    setCurrentCardType(null);
    setEditingAssetId(null);
    setSpot_color_pairs([{ spot: '', color: undefined }]);
  };

  const openAssetModal = () => {
    setIsAssetModalOpen(true);
  };

  const closeAssetModal = () => {
    setIsAssetModalOpen(false);
    setEditingAssetId(null);
    setEditingAsset(null);
    resetCurrentConfig();
  };

  const addAssetWithConfig = async (config: AssetConfig, spot_color_pairs_from_form: SpotColorPair[]) => {
    if (!jobData?.job_id || savingAsset) return;
    
    setSavingAsset(true);
    
    try {
      // Build asset configuration
      let assetConfig: any = {
        type: config.type
      };
      
      // Only include chrome if it has a value
      if (config.chrome) {
        assetConfig.chrome = config.chrome;
      }

      // Handle parallel/multi-parallel with multiple spot/color pairs
      if (config.type === 'parallel' || config.type === 'multi-parallel') {
        const validPairs = spot_color_pairs_from_form.filter(pair => pair.spot && pair.color);
        
        // For parallel types, either need spot/color pairs OR chrome effect (like superfractor)
        if (validPairs.length === 0 && !config.chrome) {
          throw new Error('No valid spot/color pairs found');
        }
        
        // Base layer is required for parallel types too
        if (!config.layer) throw new Error('Base layer is required');
        
        assetConfig = {
          ...assetConfig,
          layer: config.layer,
          vfx: config.vfx
        };

        // Only add spot_color_pairs if there are valid pairs
        if (validPairs.length > 0) {
          assetConfig.spot_color_pairs = validPairs.map(pair => ({
            spot: pair.spot,
            color: getColorRgbByName(pair.color || '')
          }));
        }

        // Include wp_inv_layer if VFX or chrome is enabled
        if ((config.vfx || config.chrome) && config.wp_inv_layer) {
          assetConfig.wp_inv_layer = config.wp_inv_layer;
        }
      } else {
        // Handle other card types
        if (!config.layer) throw new Error('Layer is required');
        
        assetConfig = {
          ...assetConfig,
          layer: config.layer,
          spot: config.spot,
          color: config.color ? getColorRgbByName(config.color) : undefined,
          vfx: config.vfx
        };

        // Include wp_inv_layer if VFX or chrome is enabled
        if ((config.vfx || config.chrome) && config.wp_inv_layer) {
          assetConfig.wp_inv_layer = config.wp_inv_layer;
        }
      }

      // Asset payload with name and configuration - backend will generate ID
      const assetPayload = {
        ...assetConfig,
        name: config.name?.trim()
      };

      let response;
      if (config.id && config.id !== '') {
        // Update existing asset
        response = await assetMutation({
          type: 'updateAsset',
          jobId: jobData.job_id,
          assetId: config.id,
          data: assetPayload
        });
      } else {
        // Create new asset - backend will generate ID and store this config
        response = await assetMutation({
          type: 'createAsset',
          jobId: jobData.job_id,
          data: assetPayload
        });
        
        // If creating a new asset with superfractor chrome and oneOfOneWp enabled, also create a wp-1of1 version
        // This applies to both original 'base' type and 'front' cards that become 'parallel' due to superfractor
        if (response.success && config.chrome === 'superfractor' && config.oneOfOneWp) {
          console.log('🎯 Creating additional wp-1of1 asset for superfractor + oneOfOneWp...');
          
          // Get WP layers for the wp-1of1 asset
          const wpLayers = getLayersByType('wp');
          if (wpLayers.length > 0) {
            const wp1of1Payload = {
              type: 'wp-1of1',
              layer: wpLayers[0], // Use first available WP layer - no VFX or chrome like regular wp
              name: `${config.name?.trim()}_WP_1OF1`
            };
            
            try {
              const wp1of1Response = await assetMutation({
                type: 'createAsset',
                jobId: jobData.job_id,
                data: wp1of1Payload
              });
              console.log('✅ wp-1of1 asset created for superfractor + oneOfOneWp:', wp1of1Response);
            } catch (wp1of1Error) {
              console.error('❌ Error creating wp-1of1 asset:', wp1of1Error);
              // Don't fail the main asset creation if wp-1of1 fails
            }
          }
        }
      }

      if (response.success) {
        console.log('✅ Asset saved successfully:', response);
        
        // Handle create_asset response format: nested assets structure
        if (onJobDataUpdate) {
          if (response.job) {
            console.log('🔄 Using legacy job object from response to update UI');
            onJobDataUpdate(response.job);
          } else if (response.assets?.assets && typeof response.assets.assets === 'object') {
            console.log('🔄 Using create_asset response assets directly (no redundant list_assets call)');
            console.log('📊 Assets in response:', {
              assetCount: Object.keys(response.assets.assets).length,
              isEmpty: Object.keys(response.assets.assets).length === 0
            });
            onJobDataUpdate({ job_id: jobData.job_id, assets: response.assets.assets });
          } else {
            console.log('⚠️ Unexpected response format from create_asset, using fallback refetch');
            console.log('Response structure:', Object.keys(response));
            console.log('Assets structure:', response.assets ? Object.keys(response.assets) : 'no assets');
            onJobDataUpdate({ _forceRefetch: true, job_id: jobData.job_id });
          }
        }
      } else {
        console.log('❌ Asset creation failed:', {
          success: response.success,
          hasJob: !!response.job,
          hasCallback: !!onJobDataUpdate,
          response: response
        });
        throw new Error('Asset creation failed');
      }
    } catch (error) {
      console.error('❌ Error saving asset:', error);
      alert(`Failed to save asset: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error; // Re-throw so the form knows there was an error
    } finally {
      setSavingAsset(false);
    }
  };

  // Keep the old addAsset function for backward compatibility with edit functionality
  const addAsset = async () => {
    if (!currentCardType || !jobData?.job_id || savingAsset) return;
    
    const config = {
      ...currentConfig,
      type: currentCardType,
      id: editingAssetId || ''
    } as AssetConfig;
    
    await addAssetWithConfig(config, spot_color_pairs);
    resetCurrentConfig();
  };

  const removeAsset = async (id: string) => {
    if (!jobData?.job_id || savingAsset) return;
    
    setSavingAsset(true);
    
    try {
      console.log('🗑️ Removing asset:', id);
      const response = await assetMutation({
        type: 'deleteAsset',
        jobId: jobData.job_id,
        assetId: id
      });
      
        {
          console.log('✅ Asset removed successfully:', response);
          if (onJobDataUpdate) {
            if (response.job) {
              onJobDataUpdate(response.job);
            } else if (response.assets?.assets && typeof response.assets.assets === 'object') {
              console.log('🔄 Using delete_asset response assets directly (no redundant list_assets call)');
              console.log('📊 Assets in response:', {
                assetCount: Object.keys(response.assets.assets).length,
                isEmpty: Object.keys(response.assets.assets).length === 0
              });
              onJobDataUpdate({ job_id: jobData.job_id, assets: response.assets.assets });
            } else {
              console.log('⚠️ Unexpected response format from delete_asset, using fallback local removal');
              console.log('Response structure:', Object.keys(response));
              console.log('Assets structure:', response.assets ? Object.keys(response.assets) : 'no assets');
              // Fallback: remove locally
              const existingAssets = (mergedJobData?.assets || {}) as Record<string, any>;
              const updatedAssets: Record<string, any> = { ...existingAssets };
              delete updatedAssets[id];
              onJobDataUpdate({ job_id: jobData.job_id, assets: updatedAssets });
            }
          }
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
    setIsAssetModalOpen(true);
    
    // Convert RGB values back to color names for UI form
    const convertedAsset = {
      ...asset,
      color: asset.color?.startsWith('R') ? getColorNameByRgb(asset.color) : asset.color
    };
    setCurrentConfig(convertedAsset);
    setEditingAssetId(asset.id);
    setEditingAsset(convertedAsset);
    
    // For parallel assets, populate the spot/color pairs
    if (asset.type === 'parallel' || asset.type === 'multi-parallel') {
      if (asset.spot_color_pairs && asset.spot_color_pairs.length > 0) {
        // New format with multiple pairs - convert RGB values to color names for UI
        const convertedPairs = asset.spot_color_pairs.map(pair => ({
          spot: pair.spot,
          color: pair.color?.startsWith('R') ? getColorNameByRgb(pair.color) : pair.color
        }));
        setSpot_color_pairs(convertedPairs);
      } else if (asset.spot && asset.color) {
        // Legacy format with single spot/color
        setSpot_color_pairs([{
          spot: asset.spot,
          color: asset.color?.startsWith('R') ? getColorNameByRgb(asset.color) : asset.color
        }]);
      }
      // Clear spot/color from current config since it's in the pairs
      setCurrentConfig(prev => ({ ...prev, spot: undefined, color: undefined }));
    }
  };

  // Helper function to get layers by type - needed for getLayersByType call in addAsset
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

  const getWpInvLayers = () => {
    const extractedLayers = getExtractedLayers();
    return extractedLayers.filter(layer => 
      layer.toLowerCase().includes('wp') && layer.toLowerCase().includes('inv')
    );
  };

  // EDR PDF upload handling
  const handleEDRPdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('📋 EDR PDF Upload initiated:', file.name, 'Size:', (file.size / 1024 / 1024).toFixed(2), 'MB');
    
    const fileSizeMB = file.size / (1024 * 1024);
    
    setProcessingPdf(true);
    setUploadProgress(0);

    try {
      // Always use streaming approach (base64 no longer supported)
      console.log('📋 Using streaming upload approach for all files');
      await handleAllFileUpload(file, fileSizeMB);
    } catch (error) {
      console.error('❌ Error uploading EDR PDF:', error);
      alert(`Failed to process PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProcessingPdf(false);
      setUploadProgress(0);
    }

    // Clear the input value so the same file can be selected again
    event.target.value = '';
  };

  // Handle all file uploads using direct S3 proxy approach (bypasses Vercel limits)
  const handleAllFileUpload = async (file: File, fileSizeMB: number) => {
    console.log('📋 Starting direct S3 proxy upload for EDR PDF...');
    
    const s3FileName = file.name;
    const appName = jobData?.app_name || 'default_app';
    const presignedPath = `${appName}/EDR/${s3FileName}`;  // For presigned URL
    
    setUploadProgress(10);

    // Step 1: Get presigned PUT URL from our S3 proxy
    console.log('📋 Step 1: Getting presigned PUT URL...');
    
    const putUrlResponse = await fetch('/api/s3-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_method: 'put',
        filename: presignedPath,
        expires_in: 3600
      }),
    });

    if (!putUrlResponse.ok) {
      throw new Error('Failed to get PUT presigned URL for EDR upload');
    }

    const { url: putUrl } = await putUrlResponse.json();
    
    // Extract S3 key from the presigned URL for the extract API
    const urlObj = new URL(putUrl);
    const s3PathFromUrl = urlObj.pathname.substring(1); // Remove leading slash and query params are automatically excluded
    const extractApiS3Key = s3PathFromUrl; // Clean S3 key without query parameters
    
    console.log('📋 Extracted S3 key from presigned URL:', extractApiS3Key);
    setUploadProgress(30);

    // Step 2: Upload file via our S3 proxy (bypasses Vercel payload limits and CORS)
    console.log('📋 Step 2: Uploading file via S3 proxy...');
    
    const uploadResponse = await fetch('/api/s3-upload', {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/pdf',
        'x-presigned-url': putUrl,
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`S3 upload failed: ${uploadResponse.status} ${errorText}`);
    }

    console.log('✅ PDF uploaded to S3 successfully:', extractApiS3Key);
    setUploadProgress(85);

    // Step 3: Process the PDF via Content Pipeline using S3 key
    console.log('📋 Step 3: Calling Content Pipeline for PDF extraction...');
    
    // Get extracted layers to include in the request
    const allExtractedLayers = getExtractedLayers();
    
    // Filter out specific layer types that shouldn't be sent to PDF extraction
    const filteredLayers = allExtractedLayers.filter(layer => {
      const lowerLayer = layer.toLowerCase();
      return !lowerLayer.includes('bk_seq') && 
             !lowerLayer.includes('bk_seq_bb');
    });
    
    // Prepare API request with full S3 key for extract API
    const requestPayload = {
      s3_key: extractApiS3Key,  // Use full S3 key for extract API
      filename: file.name,
      layers: filteredLayers.length > 0 ? filteredLayers : undefined,
      job_id: jobData?.job_id
    };

    console.log('📋 Calling content pipeline API /pdf-extract:', {
      filename: file.name,
      jobId: jobData?.job_id,
      s3Key: extractApiS3Key,
      fileSizeMB: fileSizeMB.toFixed(2),
      totalLayersFound: allExtractedLayers.length,
      filteredLayersCount: filteredLayers.length,
      filteredLayers: filteredLayers,
      excludedLayers: allExtractedLayers.filter(layer => !filteredLayers.includes(layer))
    });

    setUploadProgress(90);

    // Call the content pipeline API with S3 key via centralized data store
    const response = await assetMutation({
      type: 'extractPdfData',
      data: requestPayload
    });
    
    console.log('✅ PDF Extract API Response:', response);
    setUploadProgress(95);

    // Update job data - handle nested assets structure
    const edrAssets = (response as any)?.assets?.assets || (response as any)?.assets;
    if (onJobDataUpdate && edrAssets && typeof edrAssets === 'object') {
      console.log('🔄 EDR: Using response assets directly (no redundant list_assets call)');
      console.log('📊 EDR Assets in response:', {
        assetCount: Object.keys(edrAssets).length,
        isEmpty: Object.keys(edrAssets).length === 0,
        hasNestedStructure: !!(response as any)?.assets?.assets
      });
      onJobDataUpdate({ job_id: jobData?.job_id, assets: edrAssets });
    } else {
      console.warn('⚠️ EDR: No assets found in response - unexpected format');
      console.log('🔍 EDR: Response structure:', Object.keys(response as any));
      console.log('🔍 EDR: Assets structure:', (response as any)?.assets ? Object.keys((response as any).assets) : 'no assets');
    }
  };

  if (!isVisible) return null;

  const configuredAssets = getConfiguredAssets();
  const canCreateAssets = configuredAssets.length > 0;

  // Debug when component re-renders due to asset changes
  console.log('🔍 PSDTemplateSelector render:', {
    configuredAssetsCount: configuredAssets.length,
    configuredAssetIds: configuredAssets.map(a => a.id),
    hasMergedJobData: !!mergedJobData,
    mergedJobDataAssets: mergedJobData?.assets ? Object.keys(mergedJobData.assets) : 'no assets',
    mergedJobDataKeys: mergedJobData ? Object.keys(mergedJobData) : [],
    timestamp: new Date().toISOString()
  });

  return (
    <>
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(147, 51, 234, 0.15))',
        border: '2px solid rgba(59, 130, 246, 0.3)',
        borderRadius: 16,
        position: 'relative', // For loading overlay positioning
        padding: 24,
        marginBottom: 32,
        overflow: 'hidden'
      }}>
        {/* Simple loading overlay */}
        {savingAsset && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            borderRadius: 16
          }}>
            <div style={{
              width: 24,
              height: 24,
              border: '2px solid rgba(255, 255, 255, 0.3)',
              borderTop: '2px solid #fff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
          </div>
        )}
        
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
            {mergedJobData?.job_status?.toLowerCase() === 'generation-failed' ? '🔄' : '⚡'}
          </div>
          <div>
            <h2 style={{
              fontSize: '1.4rem',
              fontWeight: 700,
              color: '#f8f8f8',
              margin: '0 0 8px 0'
            }}>
              ⚡ {mergedJobData?.job_status?.toLowerCase() === 'generation-failed' ? 'Retry Asset Generation' : 'Action Required: Configure Digital Assets'}
            </h2>
            <p style={{
              fontSize: '1rem',
              color: '#bfdbfe',
              margin: 0,
              lineHeight: 1.5
            }}>
              {mergedJobData?.job_status?.toLowerCase() === 'generation-failed' 
                ? 'Asset generation failed. Review and modify your configuration below, then retry generation.'
                : 'Configure your digital assets by selecting a PSD template and configuring card types, layers, and colors below.'
              }
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

          {/* Assets Table - Always visible when assets exist or to allow creation */}
                          {(() => {
            console.log('🔍 Asset display check:', {
              configuredAssetsCount: configuredAssets.length,
              hasJobData: !!jobData,
              hasMergedJobData: !!mergedJobData
            });
            return true; // Always show the asset table
          })() && (
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              <AssetsTable
                configuredAssets={configuredAssets}
                savingAsset={savingAsset}
                processingPdf={processingPdf}
                creatingAssets={creatingAssets}
                uploadProgress={uploadProgress}
                jobData={jobData}
                getWpInvLayers={getWpInvLayers}
                onEditAsset={editAsset}
                onRemoveAsset={removeAsset}
                onCreateAssets={createAssets}
                onJobDataUpdate={onJobDataUpdate}
                onEDRPdfUpload={handleEDRPdfUpload}
                onAddAsset={selectedPhysicalFile && jsonData && !loadingJsonData ? openAssetModal : undefined}
              />
                      </div>
                    )}

          {/* PSD File Selection and Asset Creation - Only when PSD functionality is needed */}
          {selectedPhysicalFile && jsonData && !loadingJsonData && (
            <div style={{ marginTop: 24 }}>
              {/* PSD file is selected and ready - additional functionality can go here if needed */}
                      </div>
                    )}

                              </div>
              </div>

      {/* Asset Creation Modal - Render outside main container */}
      <AssetCreationForm
        isOpen={isAssetModalOpen}
        onClose={closeAssetModal}
        jsonData={jsonData}
        getExtractedLayers={getExtractedLayers}
        getConfiguredAssets={getConfiguredAssets}
        generateAssetName={generateAssetName}
        savingAsset={savingAsset}
        editingAssetId={editingAssetId}
        editingAsset={editingAsset}
        onAddAsset={async (config, spot_color_pairs_from_form) => {
          // Call addAsset directly with the config from the form
          await addAssetWithConfig(config, spot_color_pairs_from_form);
        }}
        onResetConfig={resetCurrentConfig}
      />
    </>
  );
}; 
