'use client';

import { useState } from 'react';
import { useAppDataStore } from '../hooks/useAppDataStore';
import { ConfirmationModal } from './ConfirmationModal';

// For multiple spot/color selections in parallel mode
interface SpotColorPair {
  spot: string;
  color?: string;
}

interface AssetConfig {
  id: string;
  asset_id?: string;
  name: string;
  type: 'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel' | 'wp-1of1' | 'front';
  layer: string;
  seq?: string; // e.g. "1/1"
  spot?: string;
  color?: string;
  spot_color_pairs?: SpotColorPair[];
  vfx?: string;
  chrome: string | boolean;
  oneOfOneWp?: boolean;
  wp_inv_layer?: string;
  // Foil/coldfoil metadata for compatibility with table props
  coldfoil?: { coldfoil_layer?: string; coldfoil_color?: string };
  foil?: boolean | { foil_layer?: string; foil_color?: string };
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
  // Determine job type for conditional UI (special-case topps_now)
  const jobTypeRaw = (jobData as any)?.job_type || (jobData as any)?.app_name || '';
  const jobType = typeof jobTypeRaw === 'string' ? jobTypeRaw.toLowerCase() : '';
  const isToppsNow = jobType.includes('topps_now');
  const isPhysicalToDigital = jobType === 'physical_to_digital';
  
  // State for delete confirmation modal
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeletingAssets, setIsDeletingAssets] = useState(false);
  
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
        // Ensure we pass asset_id (map from id if necessary) to avoid duplicates
        const resolvedAssetId = asset.asset_id || asset.id;
        if (resolvedAssetId) cleanAsset.asset_id = resolvedAssetId;
        
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
      
      // Start with all assets that are NOT being updated (wp, wp-1of1, superfractor, etc.)
      // Clean them to remove redundant properties like oneOfOneWp boolean
      const unchangedAssets = configuredAssets
        .filter(asset => !assetsToUpdateIds.has(asset.id))
        .map(asset => createCleanAsset(asset));
      
      // Create updated versions of the assets we're changing
      const chromeUpdatedAssets = assetsToUpdate.map(asset => {
        // Start with exact copy of asset to preserve all existing properties and field names
        const { oneOfOneWp, ...assetWithoutUIProps } = asset; // Remove only UI-specific properties
        const updatedAsset: any = { ...assetWithoutUIProps };
        // Normalize identifier to asset_id and drop id
        const resolvedAssetId = updatedAsset.asset_id || updatedAsset.id;
        if (resolvedAssetId) updatedAsset.asset_id = resolvedAssetId;
        if ('id' in updatedAsset) delete updatedAsset.id;
        
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

  const handleDeleteAllAssets = async () => {
    if (!jobData?.job_id || isDeletingAssets) return;
    
    setIsDeletingAssets(true);
    
    try {
      console.log(`🗑️ Deleting all ${configuredAssets.length} assets for job ${jobData.job_id}`);
      
      // Use dedicated delete all assets operation
      const response = await bulkUpdateAssetsMutation({
        type: 'deleteAllAssets',
        jobId: jobData.job_id,
        data: {} // No data needed for delete all
      });
      
      if (response.success) {
        console.log(`✅ Successfully deleted all assets`);
        
        // Update assets with empty object
        if (onAssetsUpdate) {
          onAssetsUpdate({ 
            job_id: jobData.job_id, 
            assets: {},
            _cacheTimestamp: Date.now()
          });
        }
      } else {
        console.error('❌ Bulk delete failed:', response);
      }
      
    } catch (error) {
      console.error('❌ Error in bulk delete:', error);
    } finally {
      setIsDeletingAssets(false);
      setShowDeleteConfirmation(false);
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
        gridTemplateColumns: isToppsNow ? 'auto' : 'auto auto',
        gap: 20,
        alignItems: 'center',
        justifyContent: 'start'
      }}>
        {/* Chrome Toggle (hidden for topps_now) */}
        {!isToppsNow && (
          <div style={{
            display: 'flex',
            justifyContent: 'flex-start',
            gap: 12,
            alignItems: 'center',
            padding: '12px 16px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: 8,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            width: 'fit-content'
          }}>
            <div>
              <div style={{
                color: '#f8f8f8',
                fontSize: 14,
                fontWeight: 500
              }}>
                Apply Chrome
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
        )}

        {/* Delete All Assets (always visible; only control for topps_now) */}
        <button
          onClick={() => setShowDeleteConfirmation(true)}
          disabled={savingAsset || creatingAssets || processingPdf || configuredAssets.length === 0}
          style={{
            padding: '8px 16px',
            background: (savingAsset || creatingAssets || processingPdf || configuredAssets.length === 0)
              ? 'rgba(156, 163, 175, 0.3)'
              : 'linear-gradient(135deg, #ef4444, #dc2626)',
            border: 'none',
            borderRadius: 6,
            color: (savingAsset || creatingAssets || processingPdf || configuredAssets.length === 0) ? '#6b7280' : 'white',
            fontSize: 13,
            fontWeight: 600,
            cursor: (savingAsset || creatingAssets || processingPdf || configuredAssets.length === 0) ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            opacity: (savingAsset || creatingAssets || processingPdf || configuredAssets.length === 0) ? 0.6 : 1,
            boxShadow: (savingAsset || creatingAssets || processingPdf || configuredAssets.length === 0) ? 'none' : '0 4px 12px rgba(239, 68, 68, 0.3)',
            justifySelf: 'start'
          }}
          onMouseEnter={(e) => {
            if (!savingAsset && !creatingAssets && !processingPdf && configuredAssets.length > 0) {
              e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
            }
          }}
          onMouseLeave={(e) => {
            if (!savingAsset && !creatingAssets && !processingPdf && configuredAssets.length > 0) {
              e.currentTarget.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
            }
          }}
        >
          🗑️ Delete All
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={handleDeleteAllAssets}
        title="Delete All Assets"
        message={`Are you sure you want to delete all ${configuredAssets.length} assets? This action cannot be undone.`}
        confirmText="Delete All"
        cancelText="Cancel"
        confirmButtonStyle="danger"
        isLoading={isDeletingAssets}
      />
    </div>
  );
};
