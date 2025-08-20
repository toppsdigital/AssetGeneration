'use client';

import { useState, useEffect } from 'react';
import { useAppDataStore } from '../hooks/useAppDataStore';

// For multiple spot/color selections in parallel mode
interface SpotColorPair {
  spot: string;
  color?: string;
}

interface AssetConfig {
  id: string;
  name: string;
  type: 'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel' | 'wp-1of1' | 'front';
  layer: string;
  spot?: string;
  color?: string;
  spot_color_pairs?: SpotColorPair[];
  vfx?: string;
  chrome: string | boolean;
  oneOfOneWp?: boolean;
  wp_inv_layer?: string;
  foil?: boolean; // For foil effect control
}

interface AssetAdvancedOptionsProps {
  configuredAssets: AssetConfig[];
  savingAsset: boolean;
  creatingAssets: boolean;
  processingPdf: boolean;
  jobData: any;
  getWpInvLayers: () => string[];
  onAssetsUpdate?: (updatedAssets: { job_id: string; assets: any; _cacheTimestamp?: number } | { _forceRefetch: true; job_id: string }) => void;
  isVisible: boolean;
}

export const AssetAdvancedOptions = ({
  configuredAssets,
  savingAsset,
  creatingAssets,
  processingPdf,
  jobData,
  getWpInvLayers,
  onAssetsUpdate,
  isVisible
}: AssetAdvancedOptionsProps) => {
  // Initialize foil toggle state based on current assets
  const getInitialFoilToggleState = () => {
    // Find front card assets
    const frontCardAssets = configuredAssets.filter(asset => 
      asset.type === 'base' || asset.type === 'parallel' || asset.type === 'multi-parallel' || asset.type === 'front'
    );
    
    // Check if any front card asset has a 'foil' property defined (regardless of true/false)
    const hasFoilProperty = frontCardAssets.some(asset => 'foil' in asset);
    
    // Toggle is OFF if any front card has foil property defined, otherwise ON (default foil behavior)
    const initialState = !hasFoilProperty;
    
    console.log(`🔄 [Foil Toggle] State calculation:`, {
      totalAssets: configuredAssets.length,
      frontCardAssets: frontCardAssets.map(asset => ({
        name: asset.name,
        type: asset.type,
        foil: asset.foil,
        hasFoilProperty: 'foil' in asset
      })),
      hasFoilProperty,
      toggleState: initialState ? 'ON' : 'OFF'
    });
    
    return initialState;
  };

  const [foilToggleState, setFoilToggleState] = useState(getInitialFoilToggleState);
  
  // Update foil toggle state when assets change (for navigation between pages)
  useEffect(() => {
    // Find front card assets
    const frontCardAssets = configuredAssets.filter(asset => 
      asset.type === 'base' || asset.type === 'parallel' || asset.type === 'multi-parallel' || asset.type === 'front'
    );
    
    // Check if any front card asset has a 'foil' property defined (regardless of true/false)
    const hasFoilProperty = frontCardAssets.some(asset => 'foil' in asset);
    
    // Toggle is OFF if any front card has foil property defined, otherwise ON (default foil behavior)
    const newToggleState = !hasFoilProperty;
    
    console.log(`🔄 [Foil Toggle] useEffect state sync:`, {
      totalAssets: configuredAssets.length,
      frontCardAssets: frontCardAssets.map(asset => ({
        name: asset.name,
        type: asset.type,
        foil: asset.foil,
        hasFoilProperty: 'foil' in asset
      })),
      hasFoilProperty,
      newToggleState: newToggleState ? 'ON' : 'OFF'
    });
    
    setFoilToggleState(newToggleState);
  }, [configuredAssets]);
  
  // Use centralized data store for asset mutations
  const { mutate: bulkUpdateAssetsMutation } = useAppDataStore('jobAssets', { 
    jobId: jobData?.job_id || '', 
    autoRefresh: false 
  });

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
        if (asset.foil !== undefined) cleanAsset.foil = asset.foil; // Include foil property if defined
        
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
        
        // Update assets with the extracted assets (handle empty object and error cases)
        const responseError = response.error;
        
        // Handle explicit "No assets found" error response
        if (responseError && responseError.includes('No assets found') && onAssetsUpdate) {
          console.log('ℹ️ bulk_update_assets returned "No assets found" - treating as empty assets');
          onAssetsUpdate({ 
            job_id: jobData.job_id, 
            assets: {},
            _cacheTimestamp: Date.now()
          });
        } else if (extractedAssets && typeof extractedAssets === 'object' && onAssetsUpdate) {
          console.log('🔄 Chrome: Using bulk_update_assets response assets directly (no redundant list_assets call):', {
            assetsCount: Object.keys(extractedAssets).length,
            isEmpty: Object.keys(extractedAssets).length === 0,
            assetIds: Object.keys(extractedAssets),
            jobId: jobData.job_id,
            hasNestedStructure: !!response.assets?.assets,
            isNormalized: response._normalized,
            assetsSource: response._assets_source,
            hasError: !!responseError
          });
          
          // Create assets update with the new assets
          onAssetsUpdate({ 
            job_id: jobData.job_id, 
            assets: extractedAssets,
            _cacheTimestamp: Date.now() // Force UI refresh
          });
        } else if (onAssetsUpdate) {
          console.log('⚠️ Unexpected response format from bulk_update_assets, using fallback refetch');
          console.log('🔄 Chrome: Response structure:', {
            hasAssets: !!response.assets,
            assetsType: typeof response.assets,
            assetsCount: response.assets ? Object.keys(response.assets).length : 0,
            isNormalized: response._normalized,
            operation: response._operation,
            error: responseError
          });
          onAssetsUpdate({ _forceRefetch: true, job_id: jobData.job_id });
        }
      } else {
        console.error('❌ Bulk chrome update failed:', response);
      }
      
    } catch (error) {
      console.error('❌ Error in bulk chrome update:', error);
    }
  };

  const handleBulkFoilToggle = async (newToggleState?: boolean) => {
    if (savingAsset || !jobData?.job_id) return;
    
    // Find all eligible assets (only front card types: base, parallel, multi-parallel)
    const eligibleAssets = configuredAssets.filter(asset => 
      asset.type === 'base' || asset.type === 'parallel' || asset.type === 'multi-parallel' || asset.type === 'front'
    );
    
    if (eligibleAssets.length === 0) {
      console.log('📋 No eligible assets for foil operations (only base, parallel, multi-parallel front cards)');
      return;
    }
    
    // Use the new state if provided, otherwise use current state
    const currentToggleState = newToggleState !== undefined ? newToggleState : foilToggleState;
    
    // Check current foil state based on toggle - when toggle is on, remove foil property; when off, add foil: false
    const shouldAddFoilFalse = !currentToggleState;
    
    console.log(`🔧 ${shouldAddFoilFalse ? 'Adding foil: false' : 'Removing foil property'} ${shouldAddFoilFalse ? 'to' : 'from'} ${eligibleAssets.length} front card assets (base/parallel/multi-parallel only)`);
    
    try {
      // Create a complete assets array: unchanged assets + foil-updated assets
      const assetsToUpdateIds = new Set(eligibleAssets.map(a => a.id));
      
      // Helper function to create clean asset object with only essential properties
      const createCleanAsset = (asset: AssetConfig) => {
        const cleanAsset: any = {
          name: asset.name,
          type: asset.type,
          layer: asset.layer
        };
        
        // Only include properties that have values
        if (asset.spot) cleanAsset.spot = asset.spot;
        if (asset.color) cleanAsset.color = asset.color;
        
        if (asset.spot_color_pairs && asset.spot_color_pairs.length > 0) {
          cleanAsset.spot_color_pairs = asset.spot_color_pairs;
        }
        
        if (asset.vfx) cleanAsset.vfx = asset.vfx;
        if (asset.chrome) cleanAsset.chrome = asset.chrome;
        if (asset.wp_inv_layer) cleanAsset.wp_inv_layer = asset.wp_inv_layer;
        if (asset.foil !== undefined) cleanAsset.foil = asset.foil; // Include foil property if defined
        
        return cleanAsset;
      };
      
      // Start with all assets that are NOT being updated (wp, back, wp-1of1, etc.)
      const unchangedAssets = configuredAssets
        .filter(asset => !assetsToUpdateIds.has(asset.id))
        .map(asset => createCleanAsset(asset));
      
      // Create updated versions of the front card assets we're changing
      const foilUpdatedAssets = eligibleAssets.map(asset => {
        // Start with exact copy of asset to preserve all existing properties
        const { oneOfOneWp, ...assetWithoutUIProps } = asset; // Remove only UI-specific properties
        const updatedAsset = { ...assetWithoutUIProps };
        
        if (shouldAddFoilFalse) {
          // Add foil: false when toggle is off
          updatedAsset.foil = false;
        } else {
          // Remove foil property entirely when toggle is on (default foil behavior)
          delete updatedAsset.foil;
        }
        
        return updatedAsset;
      });
      
      // Combine unchanged + updated assets for complete bulk update
      const allAssets = [...unchangedAssets, ...foilUpdatedAssets];
      
      console.log(`📦 Bulk updating all ${allAssets.length} assets (${unchangedAssets.length} unchanged + ${foilUpdatedAssets.length} foil-updated front cards):`, {
        unchanged: unchangedAssets.map(a => `${a.name} (${a.type})`),
        foilUpdated: foilUpdatedAssets.map(a => `${a.name} (${a.type})`),
        toggleState: `${currentToggleState ? 'ON' : 'OFF'}`
      });
      
      // Make single bulk update API call with ALL assets via centralized data store
      const response = await bulkUpdateAssetsMutation({
        type: 'bulkUpdateAssets',
        jobId: jobData.job_id,
        data: allAssets
      });
      
      if (response.success) {
        console.log(`✅ Successfully ${shouldAddFoilFalse ? 'added foil: false to' : 'removed foil property from'} ${eligibleAssets.length} front card assets`);
        
        // Extract updated assets from normalized response - handle nested structure
        const extractedAssets = response.assets?.assets || response.assets;
        
        // Update assets with the extracted assets (handle empty object and error cases)
        const responseError = response.error;
        
        // Handle explicit "No assets found" error response
        if (responseError && responseError.includes('No assets found') && onAssetsUpdate) {
          console.log('ℹ️ bulk_update_assets returned "No assets found" - treating as empty assets');
          onAssetsUpdate({ 
            job_id: jobData.job_id, 
            assets: {},
            _cacheTimestamp: Date.now()
          });
        } else if (extractedAssets && typeof extractedAssets === 'object' && onAssetsUpdate) {
          console.log('🔄 Foil: Using bulk_update_assets response assets directly (no redundant list_assets call):', {
            assetsCount: Object.keys(extractedAssets).length,
            isEmpty: Object.keys(extractedAssets).length === 0,
            assetIds: Object.keys(extractedAssets),
            jobId: jobData.job_id,
            hasNestedStructure: !!response.assets?.assets,
            isNormalized: response._normalized,
            assetsSource: response._assets_source,
            hasError: !!responseError
          });
          
          // Create assets update with the new assets
          onAssetsUpdate({ 
            job_id: jobData.job_id, 
            assets: extractedAssets,
            _cacheTimestamp: Date.now() // Force UI refresh
          });
        } else if (onAssetsUpdate) {
          console.log('⚠️ Unexpected response format from bulk_update_assets, using fallback refetch');
          console.log('🔄 Foil: Response structure:', {
            hasAssets: !!response.assets,
            assetsType: typeof response.assets,
            assetsCount: response.assets ? Object.keys(response.assets).length : 0,
            isNormalized: response._normalized,
            operation: response._operation,
            error: responseError
          });
          onAssetsUpdate({ _forceRefetch: true, job_id: jobData.job_id });
        }
      } else {
        console.error('❌ Bulk foil update failed:', response);
      }
      
    } catch (error) {
      console.error('❌ Error in bulk foil update:', error);
    }
  };

  if (!isVisible) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(147, 51, 234, 0.08))',
      border: '1px solid rgba(59, 130, 246, 0.2)',
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      animation: 'slideDown 0.2s ease-out'
    }}>
      <h4 style={{
        fontSize: 16,
        fontWeight: 600,
        color: '#f8f8f8',
        margin: '0 0 16px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        ⚙️ Advanced Options
      </h4>
      
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 24,
        alignItems: 'center'
      }}>
        {/* Chrome Toggle */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 8,
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div>
            <div style={{
              color: '#f8f8f8',
              fontSize: 14,
              fontWeight: 500,
              marginBottom: 2
            }}>
              Apply Chrome to All
            </div>
            <div style={{
              color: '#9ca3af',
              fontSize: 12
            }}>
              Toggle silver chrome for base/parallel assets only
            </div>
          </div>
          <button
            onClick={handleBulkChromeToggle}
            disabled={savingAsset || creatingAssets || processingPdf}
            style={{
              padding: '8px 16px',
              background: (savingAsset || creatingAssets || processingPdf)
                ? 'rgba(156, 163, 175, 0.3)'
                : 'linear-gradient(135deg, #d1d5db, #9ca3af)',
              border: 'none',
              borderRadius: 6,
              color: (savingAsset || creatingAssets || processingPdf) ? '#6b7280' : '#374151',
              fontSize: 13,
              fontWeight: 600,
              cursor: (savingAsset || creatingAssets || processingPdf) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: (savingAsset || creatingAssets || processingPdf) ? 0.6 : 1
            }}
            onMouseEnter={(e) => {
              if (!savingAsset && !creatingAssets && !processingPdf) {
                e.currentTarget.style.background = 'linear-gradient(135deg, #9ca3af, #6b7280)';
              }
            }}
            onMouseLeave={(e) => {
              if (!savingAsset && !creatingAssets && !processingPdf) {
                e.currentTarget.style.background = 'linear-gradient(135deg, #d1d5db, #9ca3af)';
              }
            }}
          >
            Toggle Chrome
          </button>
        </div>

        {/* Foil Toggle */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 8,
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div>
            <div style={{
              color: '#f8f8f8',
              fontSize: 14,
              fontWeight: 500,
              marginBottom: 2
            }}>
              Apply Foil to All
            </div>
            <div style={{
              color: '#9ca3af',
              fontSize: 12
            }}>
              Front cards only. ON: foil enabled (default), OFF: adds foil: false
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              color: foilToggleState ? '#10b981' : '#6b7280',
              fontSize: 13,
              fontWeight: 600
            }}>
              {foilToggleState ? 'ON' : 'OFF'}
            </span>
            <button
              onClick={async () => {
                const newState = !foilToggleState;
                setFoilToggleState(newState);
                await handleBulkFoilToggle(newState);
              }}
              disabled={savingAsset || creatingAssets || processingPdf}
              style={{
                width: 44,
                height: 24,
                background: foilToggleState 
                  ? 'linear-gradient(135deg, #10b981, #059669)'
                  : 'rgba(156, 163, 175, 0.5)',
                border: 'none',
                borderRadius: 12,
                cursor: (savingAsset || creatingAssets || processingPdf) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                position: 'relative',
                opacity: (savingAsset || creatingAssets || processingPdf) ? 0.6 : 1
              }}
            >
              <div style={{
                width: 20,
                height: 20,
                background: 'white',
                borderRadius: '50%',
                transition: 'transform 0.2s',
                transform: foilToggleState ? 'translateX(22px)' : 'translateX(2px)',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
              }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
