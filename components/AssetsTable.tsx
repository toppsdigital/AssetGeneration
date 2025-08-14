'use client';

import { contentPipelineApi } from '../web/utils/contentPipelineApi';

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
  onEDRPdfUpload
}: AssetsTableProps) => {
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
    
    // Find all eligible assets (excludes wp, back, wp-1of1, and requires wp_inv layers)
    const eligibleAssets = configuredAssets.filter(asset => 
      asset.type !== 'wp' && 
      asset.type !== 'back' && 
      asset.type !== 'wp-1of1' &&
      getWpInvLayers().length > 0
    );
    
    if (eligibleAssets.length === 0) {
      console.log('📋 No eligible assets for chrome operations');
      return;
    }
    
    // Check current chrome state - if any have silver chrome, remove it; otherwise add silver
    const assetsWithSilverChrome = eligibleAssets.filter(asset => asset.chrome === 'silver');
    const shouldRemoveChrome = assetsWithSilverChrome.length > 0;
    
    const assetsToUpdate = shouldRemoveChrome 
      ? assetsWithSilverChrome  // Only update assets with silver chrome
      : eligibleAssets.filter(asset => !asset.chrome); // Only update assets with no chrome
    
    if (assetsToUpdate.length === 0) {
      console.log('📋 No assets need chrome update');
      return;
    }
    
    const action = shouldRemoveChrome ? 'remove' : 'apply';
    console.log(`🔧 ${shouldRemoveChrome ? 'Removing' : 'Applying'} chrome ${shouldRemoveChrome ? 'from' : 'to'} ${assetsToUpdate.length} assets`);
    
    try {
      // Update chrome for each asset
      const updatedAssets = assetsToUpdate.map(asset => {
        if (shouldRemoveChrome) {
          // Remove chrome property entirely
          const { chrome, ...assetWithoutChrome } = asset;
          return assetWithoutChrome;
        } else {
          // Add silver chrome
          return {
            ...asset,
            chrome: 'silver'
          };
        }
      });
      
      console.log(`📦 Bulk updating ${updatedAssets.length} assets:`, updatedAssets);
      
      // Make single bulk update API call
      const response = await contentPipelineApi.bulkUpdateAssets(jobData.job_id, updatedAssets);
      
      if (response.success) {
        console.log(`✅ Successfully ${action}d chrome ${shouldRemoveChrome ? 'from' : 'to'} ${assetsToUpdate.length} assets`);
        
        // Update job data with response
        if (response.job && onJobDataUpdate) {
          console.log('🔄 Updating job data from bulk chrome response');
          onJobDataUpdate(response.job);
        } else if (onJobDataUpdate) {
          console.log('🔄 Triggering job data refresh after bulk chrome update');
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
          disabled={savingAsset || creatingAssets || processingPdf}
          style={{
            padding: '8px 16px',
            background: (savingAsset || creatingAssets || processingPdf)
              ? 'rgba(156, 163, 175, 0.3)'
              : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
            border: 'none',
            borderRadius: 8,
            color: 'white',
            fontSize: 14,
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
        
        {/* Upload Progress Indicator */}
        {processingPdf && uploadProgress > 0 && (
          <div style={{
            marginTop: 12,
            fontSize: 12,
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
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#f8f8f8', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', maxWidth: '150px', width: '150px' }}>NAME</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#f8f8f8', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em' }}>LAYERS</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#f8f8f8', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em' }}>VFX</th>
                <th 
                  style={{ 
                    padding: '10px 12px', 
                    textAlign: 'center', 
                    color: '#f8f8f8', 
                    fontSize: 13, 
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
                  title="Click to toggle chrome on/off for all eligible assets (excludes wp, back, wp-1of1)"
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
                      padding: '10px 12px', 
                      color: '#f8f8f8', 
                      fontSize: 13,
                      fontWeight: 500,
                      maxWidth: '150px',
                      width: '150px'
                    }}>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}>
                        <span style={{
                          color: '#f8f8f8',
                          fontSize: 13,
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
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: '0.02em',
                          alignSelf: 'flex-start'
                        }}>
                          {asset.type === 'base' ? 'BASE' : asset.type === 'parallel' ? 'PARALLEL' : asset.type === 'multi-parallel' ? 'MULTI-PARALLEL' : asset.type === 'wp-1of1' ? 'WP-1OF1' : asset.type.toUpperCase()}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#e5e7eb', fontSize: 13, textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                        {/* Show asset layer first */}
                        {asset.layer && (
                          <>
                            <span style={{
                              fontSize: 12,
                              fontFamily: 'monospace',
                              color: '#e5e7eb'
                            }}>
                              {asset.layer}
                            </span>
                          </>
                        )}
                        
                        {/* Show spot values from spot_color_pairs */}
                        {asset.spotColorPairs && asset.spotColorPairs.length > 0 && (
                          <div>
                            {asset.spotColorPairs.map((pair, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, justifyContent: 'center' }}>
                                <span style={{
                                  fontSize: 12,
                                  fontFamily: 'monospace',
                                  color: '#e5e7eb'
                                }}>
                                  {pair.spot}
                                </span>
                                {pair.color && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: '50%',
                                      background: pair.color?.startsWith('R') ? getColorHexByRgb(pair.color) : getColorHexByName(pair.color || ''),
                                      display: 'inline-block',
                                      border: '1px solid rgba(255, 255, 255, 0.2)'
                                    }} />
                                    <span style={{ fontSize: 12, color: '#d1d5db' }}>
                                      {pair.color?.startsWith('R') ? getColorDisplayNameByRgb(pair.color) : HARDCODED_COLORS.find(c => c.name === pair.color)?.name || pair.color}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Legacy single spot/color display */}
                        {asset.spot && (!asset.spotColorPairs || asset.spotColorPairs.length === 0) && (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                              <span style={{
                                fontSize: 12,
                                fontFamily: 'monospace',
                                color: '#e5e7eb'
                              }}>
                                {asset.spot}
                              </span>
                              {asset.color && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: asset.color?.startsWith('R') ? getColorHexByRgb(asset.color) : getColorHexByName(asset.color || ''),
                                    display: 'inline-block',
                                    border: '1px solid rgba(255, 255, 255, 0.2)'
                                  }} />
                                  <span style={{ fontSize: 12, color: '#d1d5db' }}>
                                    {asset.color?.startsWith('R') ? getColorDisplayNameByRgb(asset.color) : HARDCODED_COLORS.find(c => c.name === asset.color)?.name || asset.color}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Fallback: Show dash for empty cases */}
                        {!asset.layer && (!asset.spotColorPairs || asset.spotColorPairs.length === 0) && !asset.spot && (
                          <span style={{ color: '#6b7280' }}>—</span>
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
                          fontSize: 12,
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
                          onClick={() => onEditAsset(asset)}
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
                          onClick={() => onRemoveAsset(asset.id)}
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
          onClick={onCreateAssets}
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
  );
};
