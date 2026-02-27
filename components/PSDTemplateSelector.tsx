'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDataStore } from '../hooks/useAppDataStore';
import { AssetCreationForm } from './AssetCreationForm';
import { AssetsTable } from './AssetsTable';
import { buildS3PublicUrl } from '../utils/environment';
import { contentPipelineApi } from '../web/utils/contentPipelineApi';
import { HARDCODED_COLORS, getColorRgbByName, getColorNameByRgb } from '../utils/colors';

interface PSDFile {
  name: string;
  lastModified: string | null;
  json_url?: string;
}

interface PSDTemplateSelectorProps {
  jobData: any;
  mergedJobData: any;
  isRefreshing?: boolean;
  isVisible: boolean;
  creatingAssets: boolean;
  setCreatingAssets: React.Dispatch<React.SetStateAction<boolean>>;
  onAssetsUpdate?: (updatedAssets: { job_id: string; assets: any; _cacheTimestamp?: number } | { _forceRefetch: true; job_id: string }) => void; // Optional callback for asset updates (pdf-extract, create, update, delete, list)
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
  seq?: string; // e.g. "1/1"
  spot?: string;
  color?: string;
  spot_color_pairs?: SpotColorPair[]; // For PARALLEL cards with multiple combinations
  vfx?: string;
  chrome: string | boolean;
  foilfractor?: boolean;
  diecut?: string;
  oneOfOneWp?: boolean; // For BASE assets with superfractor chrome
  wp_inv_layer?: string; // For chrome effects
  wp?: string; // For VFX effects (wp layer, v20+)
  // Coldfoil/foil metadata
  coldfoil?: {
    coldfoil_layer?: string;
    coldfoil_color?: 'silver' | 'gold';
  };
  foil?: { foil_layer?: string; foil_color?: 'silver' | 'gold' };
}

export const PSDTemplateSelector = ({ jobData, mergedJobData, isRefreshing = false, isVisible, creatingAssets, setCreatingAssets, onAssetsUpdate }: PSDTemplateSelectorProps) => {
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
    wp_inv_layer: '',
    wp: ''
  });
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingAsset, setEditingAsset] = useState<AssetConfig | null>(null);
  const [savingAsset, setSavingAsset] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [processingPdf, setProcessingPdf] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [spot_color_pairs, setSpot_color_pairs] = useState<SpotColorPair[]>([{ spot: '', color: undefined }]);

  // Determine topps_now job type for UI behavior
  const isToppsNow = (
    ((jobData as any)?.job_type || (mergedJobData as any)?.job_type || (jobData as any)?.app_name || (mergedJobData as any)?.app_name || '')
      .toString()
      .toLowerCase()
  ).includes('topps_now');

  // Auto-select PSD file based on job type
  useEffect(() => {
    if (!loadingPhysicalFiles && physicalJsonFiles.length > 0 && !selectedPhysicalFile) {
      const jobTypeSource = (
        (jobData as any)?.job_type ||
        (mergedJobData as any)?.job_type ||
        (jobData as any)?.app_name ||
        (mergedJobData as any)?.app_name ||
        ''
      )
        .toString()
        .toLowerCase();

      let defaultIndex = 0; // default to first
      if (jobTypeSource.includes('topps_now')) {
        defaultIndex = Math.min(1, physicalJsonFiles.length - 1); // prefer second if available
      }

      const chosenFile = physicalJsonFiles[defaultIndex].name;
      console.log('🔄 Auto-selecting PSD file based on job type:', {
        jobType: jobTypeSource,
        defaultIndex,
        chosenFile,
      });
      setSelectedPhysicalFile(chosenFile);
    }
  }, [physicalJsonFiles, selectedPhysicalFile, loadingPhysicalFiles, jobData?.job_type, mergedJobData?.job_type, jobData?.app_name, mergedJobData?.app_name]);

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
          public_url: buildS3PublicUrl('digital_to_physical_psd_files.json'),
          file_type: 'psd'
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch JSON files: ${response.status}`);
      }

      const data = await response.json();
      console.log('📁 Physical PSD files response:', data);
      
      const physicalFiles = (data.files || []).map((file: any) => {
        const derivedNameFromUrl = (file.json_url || '')
          .toString()
          .split('/')
          .pop() || '';
        return {
          name: file.file_name || file.name || derivedNameFromUrl,
          lastModified: null,
          json_url: file.json_url
        };
      });
      
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

  const createAssets = async (retryFailedOnly: boolean = false) => {
    console.log(`🎨 ${retryFailedOnly ? 'Retrying failed' : 'Creating'} digital assets:`, {
      selectedFile: selectedPhysicalFile,
      psdFile: jsonData?.psd_file,
      retryFailedOnly
    });

    setCreatingAssets(true);

    try {
      const psdFile = selectedPhysicalFile.split('/').pop()?.replace('.json', '.psd') || '';
      
      const payload: any = {
        psd_file: psdFile
      };

      // Add retry_failed_only flag when retrying failed assets
      if (retryFailedOnly) {
        payload.retry_failed_only = true;
      }

      console.log('📋 API Payload:', payload);

      const response = await assetMutation({
        type: 'generateAssets',
        jobId: jobData!.job_id!,
        data: payload
      });
      
      console.log('✅ Assets creation response:', response);
      
      router.push('/jobs');
      
    } catch (error) {
      console.error(`❌ Error ${retryFailedOnly ? 'retrying failed' : 'creating'} assets:`, error);
      alert(`Failed to ${retryFailedOnly ? 'retry failed' : 'create'} assets: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setCreatingAssets(false);
    }
  };

  const createAssetsWithRetry = () => createAssets(true);

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
      jobId: mergedJobData?.job_id,
      hasError: !!mergedJobData?.error
    });
    
    // Handle explicit "No assets found" error response
    if (mergedJobData?.error && mergedJobData?.error.includes('No assets found')) {
      console.log('ℹ️ API returned "No assets found" error - treating as empty assets');
      return [];
    }
    
    // Handle missing or empty assets object
    if (!mergedJobData?.assets || (typeof mergedJobData.assets === 'object' && Object.keys(mergedJobData.assets).length === 0)) {
      console.log('ℹ️ No assets or empty assets object in mergedJobData, returning empty array');
      return [];
    }
    
    const assets = Object.entries(mergedJobData.assets).map(([assetId, assetData]: [string, any]) => {
      const seq =
        typeof assetData?.seq === 'string'
          ? assetData.seq.trim()
          : assetData?.seq != null
            ? String(assetData.seq).trim()
            : undefined;
      const asset: any = {
        id: assetId,
        name: assetData.name || assetData.type?.toUpperCase() || 'UNNAMED',
        type: assetData.type || 'wp',
        layer: assetData.layer || '',
        seq: seq || undefined,
        spot: assetData.spot,
        color: assetData.color,
        spot_color_pairs: assetData.spot_color_pairs || [],
        vfx: assetData.vfx,
        chrome: assetData.chrome || false,
        foilfractor: assetData.foilfractor === true,
        oneOfOneWp: assetData.oneOfOneWp || false,
        wp_inv_layer: assetData.wp_inv_layer || '',
        wp: assetData.wp || ''
      };
      
      // Only include foil property if it is an object with metadata
      if (assetData.foil && typeof assetData.foil === 'object') {
        asset.foil = assetData.foil as { foil_layer?: string; foil_color?: string };
      }

      // Include coldfoil metadata when present
      if (assetData.coldfoil !== undefined) {
        asset.coldfoil = assetData.coldfoil;
      }
      
      return asset;
    });
    
    console.log('✅ Parsed assets from mergedJobData.assets:', {
      count: assets.length,
      assetIds: assets.map(a => a.id),
      assetNames: assets.map(a => a.name),
      assetTypes: assets.map(a => a.type),
      assetsWithFoil: assets.filter(a => 'foil' in a).map(a => ({ id: a.id, name: a.name, foil: a.foil }))
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
    setCurrentConfig({ chrome: false, oneOfOneWp: false, name: '', wp_inv_layer: '', wp: '' });
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
      const pushAssetsUpdate = (resp: any) => {
        if (!onAssetsUpdate) return;
        const responseError = resp?.error;

        // Handle explicit "No assets found" error response
        if (responseError && responseError.includes('No assets found')) {
          onAssetsUpdate({ job_id: jobData.job_id, assets: {} });
          return;
        }

        if (resp?.job) {
          onAssetsUpdate(resp.job);
          return;
        }

        if (resp?.assets?.assets && typeof resp.assets.assets === 'object') {
          onAssetsUpdate({ job_id: jobData.job_id, assets: resp.assets.assets });
          return;
        }

        // Fallback: refetch
        onAssetsUpdate({ _forceRefetch: true, job_id: jobData.job_id });
      };

      const hasWp1of1Asset = (assetsObj: any): boolean => {
        if (!assetsObj || typeof assetsObj !== 'object') return false;
        return Object.values(assetsObj).some((a: any) => {
          const t = (a?.type || '').toString().toLowerCase();
          return t === 'wp-1of1';
        });
      };

      // Resolve asset id from provided config or current editing state
      const resolvedAssetId = (config.id && config.id !== '') ? config.id : (editingAssetId || '');
      // Build asset configuration
      let assetConfig: any = {
        type: config.type
      };
      
      // Only include chrome if it has a value
      if (config.chrome) {
        assetConfig.chrome = config.chrome;
      }

      // Include foilfractor only when enabled; omit entirely when disabled
      if (config.foilfractor === true) {
        assetConfig.foilfractor = true;
      }

      // Include diecut only when enabled (string value = layer identifier)
      if (config.diecut) {
        assetConfig.diecut = config.diecut;
      }

      // Include seq only when explicitly "1/1"
      if (config.seq && config.seq.toString().trim() === '1/1') {
        assetConfig.seq = '1/1';
      }

      // Include foil if explicitly provided
      if (typeof config.foil !== 'undefined') {
        assetConfig.foil = config.foil;
      }

      // Include coldfoil if explicitly provided
      if (typeof config.coldfoil !== 'undefined') {
        assetConfig.coldfoil = config.coldfoil;
      }

      // Always include asset_id when we have one to avoid duplicate creations on update
      if (resolvedAssetId) {
        assetConfig.asset_id = resolvedAssetId;
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
          layer: config.layer
        };

        // Only include VFX if it has a valid non-empty value
        if (config.vfx && config.vfx.trim() !== '') {
          assetConfig.vfx = config.vfx;
        }

        // Only add spot_color_pairs if there are valid pairs
        if (validPairs.length > 0) {
          assetConfig.spot_color_pairs = validPairs.map(pair => ({
            spot: pair.spot,
            color: getColorRgbByName(pair.color || '')
          }));
        }

        // Include wp_inv_layer for chrome/foilfractor
        if (config.chrome || config.foilfractor === true) {
          const wpInvLayer = config.wp_inv_layer || getWpInvLayers()[0];
          if (wpInvLayer) {
            assetConfig.wp_inv_layer = wpInvLayer;
          }
        }
        // Include wp for VFX (v20+ wpcv uses wp layer)
        if (config.vfx && config.vfx.trim() !== '') {
          const wpLayer = config.wp || getWpLayers()[0];
          if (wpLayer) {
            assetConfig.wp = wpLayer;
          }
        }
      } else {
        // Handle other card types
        if (!config.layer) throw new Error('Layer is required');
        
        assetConfig = {
          ...assetConfig,
          layer: config.layer,
          spot: config.spot,
          color: config.color ? getColorRgbByName(config.color) : undefined
        };

        // Back-side spot support: include spot_color_pairs when provided (bk_spot... exists)
        if (config.type === 'back') {
          const validPairs = spot_color_pairs_from_form.filter(pair => pair.spot && pair.color);
          if (validPairs.length > 0) {
            assetConfig.spot_color_pairs = validPairs.map(pair => ({
              spot: pair.spot,
              color: getColorRgbByName(pair.color || '')
            }));
          }
        }

        // Only include VFX if it has a valid non-empty value
        if (config.vfx && config.vfx.trim() !== '') {
          assetConfig.vfx = config.vfx;
        }

        // Include wp_inv_layer for chrome/foilfractor
        if (config.chrome || config.foilfractor === true) {
          const wpInvLayer = config.wp_inv_layer || getWpInvLayers()[0];
          if (wpInvLayer) {
            assetConfig.wp_inv_layer = wpInvLayer;
          }
        }
        // Include wp for VFX (v20+ wpcv uses wp layer)
        if (config.vfx && config.vfx.trim() !== '') {
          const wpLayer = config.wp || getWpLayers()[0];
          if (wpLayer) {
            assetConfig.wp = wpLayer;
          }
        }
      }

      // Asset payload with name and configuration - backend will generate ID
      const assetPayload = {
        ...assetConfig,
        name: config.name?.trim()
      };

      let response;
      if (resolvedAssetId) {
        // Update existing asset
        response = await assetMutation({
          type: 'updateAsset',
          jobId: jobData.job_id,
          assetId: resolvedAssetId,
          data: assetPayload
        });
      } else {
        // Create new asset - backend will generate ID and store this config
        response = await assetMutation({
          type: 'createAsset',
          jobId: jobData.job_id,
          data: assetPayload
        });
      }

      if (response.success) {
        console.log('✅ Asset saved successfully:', response);
        
        // Update UI/cached assets from the response
        pushAssetsUpdate(response);

        // If seq=1/1, ensure a wp-1of1 asset exists.
        const shouldEnsureWp1of1 = config.seq && config.seq.toString().trim() === '1/1';

        if (shouldEnsureWp1of1) {
          const assetsObjFromResponse = response?.assets?.assets;
          const assetsObjFromState = (mergedJobData?.assets || {}) as Record<string, any>;
          const hasAlready = hasWp1of1Asset(assetsObjFromResponse || assetsObjFromState);

          if (!hasAlready) {
            console.log('🎯 Creating wp-1of1 asset (missing) due to 1/1 policy...');
            const wpLayers = getLayersByType('wp');
            if (wpLayers.length > 0) {
              const wp1of1Payload = {
                type: 'wp-1of1',
                layer: wpLayers[0],
                name: 'wp-1of1'
              };
              try {
                const wp1of1Response = await assetMutation({
                  type: 'createAsset',
                  jobId: jobData.job_id,
                  data: wp1of1Payload
                });
                console.log('✅ wp-1of1 asset created:', wp1of1Response);
                // Push updated assets into UI/cache if possible
                pushAssetsUpdate(wp1of1Response);
              } catch (wp1of1Error) {
                console.error('❌ Error creating wp-1of1 asset:', wp1of1Error);
                // Don't fail the main asset save if wp-1of1 fails
              }
            } else {
              console.warn('⚠️ No WP layers available; cannot auto-create wp-1of1 asset.');
            }
          }
        }
      } else {
        console.log('❌ Asset creation failed:', {
          success: response.success,
          hasJob: !!response.job,
          hasCallback: !!onAssetsUpdate,
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
          if (onAssetsUpdate) {
            const responseError = response.error;
            
            // Handle explicit "No assets found" error response (may happen after deleting the last asset)
            if (responseError && responseError.includes('No assets found')) {
              console.log('ℹ️ delete_asset returned "No assets found" - treating as empty assets (last asset deleted)');
              onAssetsUpdate({ job_id: jobData.job_id, assets: {} });
            } else if (response.job) {
              onAssetsUpdate(response.job);
            } else if (response.assets?.assets && typeof response.assets.assets === 'object') {
              console.log('🔄 Using delete_asset response assets directly (no redundant list_assets call)');
              console.log('📊 Assets in response:', {
                assetCount: Object.keys(response.assets.assets).length,
                isEmpty: Object.keys(response.assets.assets).length === 0
              });
              onAssetsUpdate({ job_id: jobData.job_id, assets: response.assets.assets });
            } else {
              console.log('⚠️ Unexpected response format from delete_asset, using fallback local removal');
              console.log('Response structure:', Object.keys(response));
              console.log('Assets structure:', response.assets ? Object.keys(response.assets) : 'no assets');
              console.log('Error in response:', responseError);
              // Fallback: remove locally
              const existingAssets = (mergedJobData?.assets || {}) as Record<string, any>;
              const updatedAssets: Record<string, any> = { ...existingAssets };
              delete updatedAssets[id];
              onAssetsUpdate({ job_id: jobData.job_id, assets: updatedAssets });
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

  const getWpLayers = () => {
    const extractedLayers = getExtractedLayers();
    return extractedLayers.filter(layer => {
      const lower = layer.toLowerCase();
      return lower.includes('wp') && !lower.includes('inv');
    });
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
    const jobIdValue = (jobData?.job_id || '').toString().trim() || 'UNKNOWN_JOB';
    const presignedPath = `${appName}/${jobIdValue}/PDFs/${s3FileName}`;  // Canonical PDFs path with job_id
    
    setUploadProgress(10);

    // Step 1: Get presigned PUT URL via content pipeline
    console.log('📋 Step 1: Getting presigned PUT URL via content pipeline...');
    
    const presignedData = await contentPipelineApi.getPresignedUrl({
      client_method: 'put',
      filename: presignedPath,
      expires_in: 3600,
      size: file.size,
      content_type: file.type || 'application/pdf'
    });

    const putUrl = presignedData.url;
    
    // For EDR uploads, we need the S3 key for the extract API
    // Use the actual S3 key from the presigned response, fallback to constructed path if not available
    const extractApiS3Key = presignedData.s3_key || presignedPath;
    
    console.log('📋 Using S3 key for extract API:', {
      s3_key: extractApiS3Key,
      from_response: !!presignedData.s3_key,
      fallback_to_constructed: !presignedData.s3_key
    });
    setUploadProgress(30);

    // Step 2: Upload file directly to S3 - handle both POST form and PUT uploads
    console.log('📋 Step 2: Uploading file directly to S3...');
    let uploadResponse;
    if (presignedData.fields && presignedData.method === 'POST') {
      // Use form POST upload directly
      console.log(`📋 Using presigned POST form upload with ${Object.keys(presignedData.fields).length} fields`);
      const formData = new FormData();
      Object.entries(presignedData.fields)
        .filter(([k]) => !k.toLowerCase().startsWith('x-amz-meta-'))
        .forEach(([k, v]) => formData.append(k, v as string));
      formData.append('file', file);
      uploadResponse = await fetch(putUrl, { method: 'POST', body: formData });
    } else {
      // Use simple PUT upload directly
      console.log(`📋 Using presigned PUT upload`);
      uploadResponse = await fetch(putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/pdf' },
        body: file,
      });
    }

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
    
    // Normalize layer names for extract API: use only the last underscore segment (e.g., 'spot1', 'wp1')
    const normalizedLayersSet = new Set(
      filteredLayers.map(layer => {
        const parts = (layer || '').split('_').filter(Boolean);
        return parts.length > 0 ? parts[parts.length - 1] : layer;
      })
    );
    const normalizedLayers = Array.from(normalizedLayersSet);
    
    // Prepare API request with full S3 key for extract API
    const requestPayload = {
      s3_key: extractApiS3Key,  // Use full S3 key for extract API
      filename: file.name,
      layers: normalizedLayers.length > 0 ? normalizedLayers : undefined,
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
      normalizedLayersCount: normalizedLayers.length,
      normalizedLayers: normalizedLayers,
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

    // Update job data via centralized cache - handle the assets structure from pdf-extract response
    const edrAssets = (response as any)?.assets; // pdf-extract returns assets directly under 'assets' key
    const responseError = (response as any)?.error;
    
    // Handle explicit "No assets found" error response
    if (responseError && responseError.includes('No assets found')) {
      console.log('ℹ️ EDR: pdf-extract returned "No assets found" - treating as empty assets');
      if (onAssetsUpdate) {
        onAssetsUpdate({ job_id: jobData?.job_id, assets: {} });
      }
    } else if (edrAssets && typeof edrAssets === 'object') {
      console.log('🔄 EDR: Updating cache with pdf-extract response assets');
      console.log('📊 EDR Assets from pdf-extract:', {
        operation: (response as any)?._operation,
        assetCount: Object.keys(edrAssets).length,
        assetsSource: (response as any)?._assets_source,
        assetKeys: Object.keys(edrAssets).slice(0, 5), // Show first 5 keys for debugging
        isEmpty: Object.keys(edrAssets).length === 0,
        hasError: !!responseError
      });
      
      // Use the callback if available, otherwise the cache sync will handle it
      if (onAssetsUpdate) {
        onAssetsUpdate({ job_id: jobData?.job_id, assets: edrAssets });
      } else {
        console.log('ℹ️ EDR: No onAssetsUpdate callback - relying on cache synchronization');
      }
    } else {
      console.warn('⚠️ EDR: Unexpected pdf-extract response format');
      console.log('🔍 EDR: Response structure:', Object.keys(response as any));
      console.log('🔍 EDR: Assets in response:', edrAssets);
      console.log('🔍 EDR: Error in response:', responseError);
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
        overflow: 'hidden',
        opacity: isRefreshing ? 0.5 : 1,
        pointerEvents: isRefreshing ? 'none' as any : 'auto'
      }}>
        {isRefreshing && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.2)'
          }} />
        )}
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
          {/* PSD File Display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <label style={{
              fontSize: 16,
              fontWeight: 600,
              color: '#f8f8f8',
              minWidth: 60
            }}>
              PSD:
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
              <div style={{
                flex: 1,
                maxWidth: 400,
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 8,
                color: '#f8f8f8',
                fontSize: 14,
                boxSizing: 'border-box'
              }}>
                {(() => {
                  if (!selectedPhysicalFile) return '—';
                  const filename = selectedPhysicalFile.split('/').pop() || selectedPhysicalFile;
                  const displayName = filename.replace('.json', '');
                  return displayName;
                })()}
              </div>
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
                onCreateAssets={() => createAssets(false)}
                onRetryFailedAssets={createAssetsWithRetry}
                onAssetsUpdate={onAssetsUpdate}
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
          const ensuredId = (config.id && config.id !== '') ? config.id : (editingAssetId || '');
          await addAssetWithConfig({ ...config, id: ensuredId }, spot_color_pairs_from_form);
        }}
        onResetConfig={resetCurrentConfig}
        isToppsNow={isToppsNow}
      />
    </>
  );
}; 
