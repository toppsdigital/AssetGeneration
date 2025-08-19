'use client';

import { useAppDataStore } from '../hooks/useAppDataStore';

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

interface AssetsTableProps {
  configuredAssets: AssetConfig[];
  savingAsset: boolean;
  processingPdf: boolean;
  creatingAssets: boolean;
  uploadProgress: number;
  jobData: any;
  getWpInvLayers: () => string[];
  onEditAsset: (asset: AssetConfig) => void;
  onRemoveAsset: (id: string) => Promise<void>;
  onCreateAssets: () => Promise<void>;
  onJobDataUpdate?: (updatedJobData: any) => void;
  onEDRPdfUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onAddAsset?: () => void;
}

// Hardcoded color mapping for consistent color selection
const HARDCODED_COLORS = [
  { name: 'Aqua', rgb: 'R0G255B255' },
  { name: 'Black', rgb: 'R51G51B51' },
  { name: 'Blue', rgb: 'R0G102B204' },
  { name: 'Brown', rgb: 'R102G51B51' },
  { name: 'Gold', rgb: 'R204G153B0' },
  { name: 'Green', rgb: 'R0G204B51' },
  { name: 'Magenta', rgb: 'R255G0B204' },
  { name: 'Orange', rgb: 'R255G102B0' },
  { name: 'Papradischa', rgb: 'R255G102B153' },
  { name: 'Peach', rgb: 'R255G204B204' },
  { name: 'Pink', rgb: 'R255G102B153' },
  { name: 'Purple', rgb: 'R153G51B255' },
  { name: 'Red', rgb: 'R255G0B0' },
  { name: 'Refractor', rgb: 'R153G153B153' },
  { name: 'Rose Gold', rgb: 'R255G102B102' },
  { name: 'Silver', rgb: 'R153G153B153' },
  { name: 'Tan', rgb: 'R204G204B153' },
  { name: 'White', rgb: 'R255G255B204' },
  { name: 'Yellow', rgb: 'R255G255B0' }
];

export const AssetsTable = ({
  configuredAssets,
  savingAsset,
  processingPdf,
  creatingAssets,
  uploadProgress,
  jobData,
  getWpInvLayers,
  onEditAsset,
  onRemoveAsset,
  onCreateAssets,
  onJobDataUpdate,
  onEDRPdfUpload,
  onAddAsset
}: AssetsTableProps) => {
  // Use centralized data store for asset mutations
  const { mutate: bulkUpdateAssetsMutation } = useAppDataStore('jobAssets', { 
    jobId: jobData?.job_id || '', 
    autoRefresh: false 
  });
  const getColorHexByRgb = (rgbValue: string): string => {
    // Convert RGB string to hex for display
    const rgbMatch = rgbValue.match(/R(\d+)G(\d+)B(\d+)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
    return '#999999'; // Default gray for unknown colors
  };

  const getColorHexByName = (colorName: string): string => {
    const color = HARDCODED_COLORS.find(c => 
      c.name.toLowerCase() === colorName.toLowerCase()
    );
    // Convert RGB to hex for display
    if (color?.rgb) {
      const rgbMatch = color.rgb.match(/R(\d+)G(\d+)B(\d+)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
        const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
        const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
      }
    }
    return '#999999'; // Default gray for unknown colors
  };

  const getColorDisplayNameByRgb = (rgbValue: string): string => {
    const color = HARDCODED_COLORS.find(c => c.rgb === rgbValue);
    return color?.name || rgbValue;
  };

  const handleBulkChromeToggle = async () => {
    if (savingAsset || !jobData?.job_id) return;
    
    // Find all eligible assets (only base, parallel, multi-parallel types, and requires wp_inv layers)
    const eligibleAssets = configuredAssets.filter(asset => 
      (asset.type === 'base' || asset.type === 'parallel' || asset.type === 'multi-parallel') &&
      getWpInvLayers().length > 0
    );
    
    if (eligibleAssets.length === 0) {
      console.log('📋 No eligible assets for chrome operations (only base, parallel, multi-parallel types)');
      return;
    }
    
    // Check current chrome state - if any have silver chrome, remove it; otherwise add silver
    // Only consider silver chrome for toggle (ignore superfractor and other chrome values)
    const assetsWithSilverChrome = eligibleAssets.filter(asset => asset.chrome === 'silver');
    const assetsWithNoChrome = eligibleAssets.filter(asset => !asset.chrome || asset.chrome === '');
    const shouldRemoveChrome = assetsWithSilverChrome.length > 0;
    
    const assetsToUpdate = shouldRemoveChrome 
      ? assetsWithSilverChrome  // Only update assets with silver chrome
      : assetsWithNoChrome; // Only update assets with no chrome (don't touch superfractor, etc.)
    
    if (assetsToUpdate.length === 0) {
      console.log('📋 No assets need chrome update', {
        eligibleAssets: eligibleAssets.length,
        withSilverChrome: assetsWithSilverChrome.length,
        withNoChrome: assetsWithNoChrome.length,
        shouldRemove: shouldRemoveChrome
      });
      return;
    }
    
    const action = shouldRemoveChrome ? 'remove' : 'apply';
    console.log(`🔧 ${shouldRemoveChrome ? 'Removing silver' : 'Applying silver'} chrome ${shouldRemoveChrome ? 'from' : 'to'} ${assetsToUpdate.length} assets (base/parallel/multi-parallel only)`);
    
    try {
      // Create a complete assets array: unchanged assets + chrome-updated assets
      const assetsToUpdateIds = new Set(assetsToUpdate.map(a => a.id));
      
      // Helper function to create clean asset object with only essential properties
      const createCleanAsset = (asset: AssetConfig) => {
        const cleanAsset: any = {
          name: asset.name,
          type: asset.type,
          layer: asset.layer
        };
        
        // Only include properties that have values (no redundant id since asset_id already exists)
        if (asset.spot) cleanAsset.spot = asset.spot;
        if (asset.color) cleanAsset.color = asset.color;
        
        if (asset.spot_color_pairs && asset.spot_color_pairs.length > 0) {
          cleanAsset.spot_color_pairs = asset.spot_color_pairs;
        }
        
        if (asset.vfx) cleanAsset.vfx = asset.vfx;
        if (asset.chrome) cleanAsset.chrome = asset.chrome;
        if (asset.wp_inv_layer) cleanAsset.wp_inv_layer = asset.wp_inv_layer;
        
        return cleanAsset;
      };
      
      // Start with all assets that are NOT being updated (wp, wp-1of1, superfractor, etc.)
      // Clean them to remove redundant properties like oneOfOneWp boolean
      const unchangedAssets = configuredAssets
        .filter(asset => !assetsToUpdateIds.has(asset.id))
        .map(asset => createCleanAsset(asset));
      
      // Create updated versions of the assets we're changing
      const chromeUpdatedAssets = assetsToUpdate.map(asset => {
        // Start with exact copy of asset to preserve all existing properties and field names
        const { oneOfOneWp, ...assetWithoutUIProps } = asset; // Remove only UI-specific properties
        const updatedAsset = { ...assetWithoutUIProps };
        
        if (shouldRemoveChrome) {
          // Remove chrome entirely
          delete updatedAsset.chrome;
          
          // Only remove wp_inv_layer if asset doesn't have VFX (since VFX also needs it)
          if (!asset.vfx) {
            delete updatedAsset.wp_inv_layer;
          } else {
            // Keep existing wp_inv_layer for VFX, or set it if missing
            const wpInvLayers = getWpInvLayers();
            const firstWpInvLayer = wpInvLayers.length > 0 ? wpInvLayers[0] : asset.wp_inv_layer;
            if (firstWpInvLayer) {
              updatedAsset.wp_inv_layer = firstWpInvLayer;
            }
          }
        } else {
          // Add chrome and wp_inv_layer, preserve everything else exactly as is
          const wpInvLayers = getWpInvLayers();
          const firstWpInvLayer = wpInvLayers.length > 0 ? wpInvLayers[0] : undefined;
          
          if (!firstWpInvLayer) {
            console.warn(`⚠️ No wp_inv_layer available for asset ${asset.name}, chrome may not work properly`);
          }
          
          updatedAsset.chrome = 'silver';
          if (firstWpInvLayer) {
            updatedAsset.wp_inv_layer = firstWpInvLayer;
          }
        }
        
        return updatedAsset;
      });
      
      // Combine unchanged + updated assets for complete bulk update
      const allAssets = [...unchangedAssets, ...chromeUpdatedAssets];
      
      console.log(`📦 Bulk updating all ${allAssets.length} assets (${unchangedAssets.length} unchanged + ${chromeUpdatedAssets.length} chrome-updated):`, {
        unchanged: unchangedAssets.map(a => `${a.name} (${a.type})`),
        chromeUpdated: chromeUpdatedAssets.map(a => `${a.name} (${a.type})`)
      });
      
      // Make single bulk update API call with ALL assets via centralized data store
      const response = await bulkUpdateAssetsMutation({
        type: 'bulkUpdateAssets',
        jobId: jobData.job_id,
        data: allAssets
      });
      
      if (response.success) {
        console.log(`✅ Successfully ${action}d chrome ${shouldRemoveChrome ? 'from' : 'to'} ${assetsToUpdate.length} assets`);
        
        // Extract updated assets from normalized response - handle nested structure
        const extractedAssets = response.assets?.assets || response.assets;
        
        // Update job data with the extracted assets (handle empty object case)
        if (extractedAssets && typeof extractedAssets === 'object' && onJobDataUpdate) {
          console.log('🔄 Chrome: Using bulk_update_assets response assets directly (no redundant list_assets call):', {
            assetsCount: Object.keys(extractedAssets).length,
            isEmpty: Object.keys(extractedAssets).length === 0,
            assetIds: Object.keys(extractedAssets),
            jobId: jobData.job_id,
            hasNestedStructure: !!response.assets?.assets,
            isNormalized: response._normalized,
            assetsSource: response._assets_source
          });
          
          // Create job data update with the new assets
          onJobDataUpdate({ 
            job_id: jobData.job_id, 
            assets: extractedAssets,
            _cacheTimestamp: Date.now() // Force UI refresh
          });
        } else if (onJobDataUpdate) {
          console.log('⚠️ Unexpected response format from bulk_update_assets, using fallback refetch');
          console.log('🔄 Chrome: Response structure:', {
            hasAssets: !!response.assets,
            assetsType: typeof response.assets,
            assetsCount: response.assets ? Object.keys(response.assets).length : 0,
            isNormalized: response._normalized,
            operation: response._operation
          });
          onJobDataUpdate({ _forceRefetch: true, job_id: jobData.job_id });
        }
      } else {
        console.error('❌ Bulk chrome update failed:', response);
      }
      
    } catch (error) {
      console.error('❌ Error in bulk chrome update:', error);
    }
  };

  const canCreateAssets = configuredAssets.length > 0;

  return (
    <div style={{
      flex: 1,
      minWidth: 600,
      background: 'rgba(255, 255, 255, 0.05)',
      borderRadius: 12,
      border: '1px solid rgba(255, 255, 255, 0.1)',
      padding: 24
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16
      }}>
        <h3 style={{
          fontSize: 20,
          fontWeight: 600,
          color: '#f8f8f8',
          margin: 0
        }}>
          Assets to Generate ({configuredAssets.length})
        </h3>
        <div style={{ display: 'flex', gap: 10 }}>
          {onAddAsset && (
            <button
              onClick={onAddAsset}
              disabled={savingAsset || creatingAssets || processingPdf}
              style={{
                padding: '10px 18px',
                background: (savingAsset || creatingAssets || processingPdf)
                  ? 'rgba(156, 163, 175, 0.3)'
                  : 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                borderRadius: 8,
                color: 'white',
                fontSize: 15,
                fontWeight: 600,
                cursor: (savingAsset || creatingAssets || processingPdf) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: (savingAsset || creatingAssets || processingPdf) ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
              onMouseOver={(e) => {
                if (!savingAsset && !creatingAssets && !processingPdf) {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #059669, #047857)';
                }
              }}
              onMouseOut={(e) => {
                if (!savingAsset && !creatingAssets && !processingPdf) {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                }
              }}
            >
              <span style={{ fontSize: 16 }}>+</span>
              Add Asset
            </button>
          )}
          <button
            onClick={() => document.getElementById('edr-pdf-input')?.click()}
            disabled={savingAsset || creatingAssets || processingPdf}
            style={{
              padding: '10px 18px',
              background: (savingAsset || creatingAssets || processingPdf)
                ? 'rgba(156, 163, 175, 0.3)'
                : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              fontSize: 15,
              fontWeight: 600,
              cursor: (savingAsset || creatingAssets || processingPdf) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: (savingAsset || creatingAssets || processingPdf) ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
            onMouseEnter={(e) => {
              if (!savingAsset && !creatingAssets && !processingPdf) {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              if (!savingAsset && !creatingAssets && !processingPdf) {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            {processingPdf ? (
              <>
                <div style={{
                  width: 14,
                  height: 14,
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                Processing PDF...
              </>
            ) : (
              <>
                📋 Import from EDR
              </>
            )}
          </button>
          <input
            id="edr-pdf-input"
            type="file"
            accept=".pdf"
            style={{ display: 'none' }}
            disabled={processingPdf}
            onChange={onEDRPdfUpload}
          />
        </div>
      </div>

      {/* Upload Progress Indicator moved below header */}
      {processingPdf && uploadProgress > 0 && (
        <div style={{
          marginTop: 4,
          marginBottom: 12,
          fontSize: 13,
          color: '#9ca3af'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: 4,
            height: 6,
            marginBottom: 4,
            overflow: 'hidden'
          }}>
            <div style={{
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
              height: '100%',
              width: `${uploadProgress}%`,
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            {uploadProgress < 10 && 'Getting upload instructions...'}
            {uploadProgress >= 10 && uploadProgress < 90 && 'Uploading file...'}
            {uploadProgress >= 90 && uploadProgress < 95 && 'Upload complete...'}
            {uploadProgress >= 95 && 'Processing PDF...'}
          </div>
        </div>
      )}
      
      {configuredAssets.length > 0 ? (
        <div style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(147, 51, 234, 0.05))',
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 24,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, lineHeight: 1.5 }}>
            <thead>
              <tr style={{ 
                background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
                borderBottom: '2px solid rgba(255, 255, 255, 0.1)'
              }}>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#f8f8f8', fontSize: 14, fontWeight: 600, letterSpacing: '0.05em', maxWidth: '300px', width: '300px' }}>NAME</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#f8f8f8', fontSize: 14, fontWeight: 600, letterSpacing: '0.05em' }}>LAYERS</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', color: '#f8f8f8', fontSize: 14, fontWeight: 600, letterSpacing: '0.05em' }}>VFX</th>
                <th 
                  style={{ 
                    padding: '12px 14px', 
                    textAlign: 'center', 
                    color: '#f8f8f8', 
                    fontSize: 14, 
                    fontWeight: 600, 
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'color 0.2s'
                  }}
                  onClick={handleBulkChromeToggle}
                  onMouseEnter={(e) => {
                    if (!savingAsset) {
                      e.currentTarget.style.color = '#c084fc';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!savingAsset) {
                      e.currentTarget.style.color = '#f8f8f8';
                    }
                  }}
                  title="Click to toggle silver chrome on/off for base, parallel, and multi-parallel assets only"
                >
                  CHROME
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: '#f8f8f8', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {configuredAssets
                .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
                .map((asset, index) => {
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
                      padding: '12px 14px', 
                      color: '#f8f8f8', 
                      fontSize: 14,
                      fontWeight: 500,
                      maxWidth: '300px',
                      width: '300px'
                    }}>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}>
                        <span style={{
                          color: '#f8f8f8',
                          fontSize: 14,
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block'
                        }}>
                          {asset.name}
                        </span>
                        <span style={{
                          background: asset.type === 'wp' ? 'rgba(34, 197, 94, 0.2)' : 
                                     asset.type === 'back' ? 'rgba(168, 85, 247, 0.2)' :
                                     asset.type === 'base' ? 'rgba(59, 130, 246, 0.2)' :
                                     asset.type === 'wp-1of1' ? 'rgba(245, 158, 11, 0.2)' :
                                     'rgba(236, 72, 153, 0.2)',
                          color: asset.type === 'wp' ? '#86efac' : 
                                 asset.type === 'back' ? '#c084fc' :
                                 asset.type === 'base' ? '#93c5fd' :
                                 asset.type === 'wp-1of1' ? '#fbbf24' :
                                 '#f9a8d4',
                          padding: '2px 6px',
                          borderRadius: 3,
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: '0.02em',
                          alignSelf: 'flex-start'
                        }}>
                          {asset.type === 'base' ? 'BASE' : asset.type === 'parallel' ? 'PARALLEL' : asset.type === 'multi-parallel' ? 'MULTI-PARALLEL' : asset.type === 'wp-1of1' ? 'WP-1OF1' : asset.type.toUpperCase()}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#e5e7eb', fontSize: 14, textAlign: 'left' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                        {/* Show asset layer first */}
                        {asset.layer && (
                          <>
                            <span style={{
                              fontSize: 14,
                              color: '#e5e7eb'
                            }}>
                              {asset.layer}
                            </span>
                          </>
                        )}
                        
                        {/* Show spot values from spot_color_pairs */}
                        {asset.spot_color_pairs && asset.spot_color_pairs.length > 0 && (
                          <div>
                            {asset.spot_color_pairs.map((pair, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, justifyContent: 'flex-start' }}>
                                <span style={{
                                  fontSize: 14,
                                  color: '#e5e7eb'
                                }}>
                                  {pair.spot}
                                </span>
                                {pair.color && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{
                                      width: 10,
                                      height: 10,
                                      borderRadius: '50%',
                                      background: pair.color?.startsWith('R') ? getColorHexByRgb(pair.color) : getColorHexByName(pair.color || ''),
                                      display: 'inline-block',
                                      border: '1px solid rgba(255, 255, 255, 0.2)'
                                    }} />
                                    <span style={{ fontSize: 14, color: '#d1d5db' }}>
                                      {pair.color?.startsWith('R') ? getColorDisplayNameByRgb(pair.color) : HARDCODED_COLORS.find(c => c.name === pair.color)?.name || pair.color}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Legacy single spot/color display */}
                        {asset.spot && (!asset.spot_color_pairs || asset.spot_color_pairs.length === 0) && (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-start' }}>
                              <span style={{
                                fontSize: 14,
                                color: '#e5e7eb'
                              }}>
                                {asset.spot}
                              </span>
                              {asset.color && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    background: asset.color?.startsWith('R') ? getColorHexByRgb(asset.color) : getColorHexByName(asset.color || ''),
                                    display: 'inline-block',
                                    border: '1px solid rgba(255, 255, 255, 0.2)'
                                  }} />
                                  <span style={{ fontSize: 14, color: '#d1d5db' }}>
                                    {asset.color?.startsWith('R') ? getColorDisplayNameByRgb(asset.color) : HARDCODED_COLORS.find(c => c.name === asset.color)?.name || asset.color}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Fallback: Show dash for empty cases */}
                        {!asset.layer && (!asset.spot_color_pairs || asset.spot_color_pairs.length === 0) && !asset.spot && (
                          <span style={{ color: '#6b7280' }}>—</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#e5e7eb', fontSize: 14 }}>
                      {asset.vfx ? (
                        <span style={{
                          background: 'rgba(147, 51, 234, 0.1)',
                          color: '#c084fc',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 14
                        }}>
                          {asset.vfx}
                        </span>
                      ) : (
                        <span style={{ color: '#6b7280' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: 14 }}>
                      {asset.type === 'wp' || asset.type === 'back' || asset.type === 'wp-1of1' || getWpInvLayers().length === 0 ? (
                        <span style={{ color: '#6b7280' }}>—</span>
                      ) : (
                        (() => {
                          const isStringChrome = typeof asset.chrome === 'string';
                          const chromeValue = isStringChrome ? String(asset.chrome).toLowerCase() : '';
                          const isSuperfractor = chromeValue === 'superfractor';
                          const isSilver = chromeValue === 'silver';
                          const pillStyles: React.CSSProperties = {
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: 14,
                            background: !asset.chrome
                              ? 'rgba(156, 163, 175, 0.2)'
                              : isSuperfractor
                                ? 'rgba(251, 191, 36, 0.15)'
                                : isSilver
                                  ? 'rgba(229, 231, 235, 0.15)'
                                  : 'rgba(34, 197, 94, 0.15)',
                            color: !asset.chrome
                              ? '#9ca3af'
                              : isSuperfractor
                                ? '#fbbf24'
                                : isSilver
                                  ? '#d1d5db'
                                  : '#86efac',
                            border: '1px solid rgba(255, 255, 255, 0.08)'
                          };
                          const dotColor = !asset.chrome
                            ? '#6b7280'
                            : isSuperfractor
                              ? '#f59e0b'
                              : isSilver
                                ? '#d1d5db'
                                : '#86efac';
                          const label = asset.chrome
                            ? (isStringChrome ? String(asset.chrome) : 'on')
                            : 'off';
                          return (
                            <span style={pillStyles}>{label}</span>
                          );
                        })()
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button
                          onClick={() => onEditAsset(asset)}
                          disabled={savingAsset}
                          style={{
                            width: 28,
                            height: 28,
                            background: savingAsset ? 'rgba(156, 163, 175, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid ' + (savingAsset ? 'rgba(156, 163, 175, 0.2)' : 'rgba(59, 130, 246, 0.2)'),
                            borderRadius: 6,
                            color: savingAsset ? '#9ca3af' : '#60a5fa',
                            fontSize: 15,
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
                          onClick={() => onRemoveAsset(asset.id)}
                          disabled={savingAsset}
                          style={{
                            width: 28,
                            height: 28,
                            background: savingAsset ? 'rgba(156, 163, 175, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid ' + (savingAsset ? 'rgba(156, 163, 175, 0.2)' : 'rgba(239, 68, 68, 0.2)'),
                            borderRadius: 6,
                            color: savingAsset ? '#9ca3af' : '#ef4444',
                            fontSize: 15,
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
            {onAddAsset 
              ? 'Click the "Add Asset" button to get started'
              : 'Select a PSD template to create new assets'
            }
          </div>
        </div>
      )}

      {/* Generate All Assets Button */}
      {configuredAssets.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            onClick={onCreateAssets}
            disabled={creatingAssets || !canCreateAssets}
            style={{
              padding: '16px 36px',
              background: creatingAssets 
                ? 'rgba(156, 163, 175, 0.5)' 
                : 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              borderRadius: 12,
              color: 'white',
              fontSize: 18,
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
        </div>
      )}
    </div>
  );
};
