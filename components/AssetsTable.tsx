'use client';

import { useState } from 'react';
import { useAppDataStore } from '../hooks/useAppDataStore';
import { AssetAdvancedOptions } from './AssetAdvancedOptions';
import { HARDCODED_COLORS, getColorHexByRgb, getColorHexByName, getColorDisplayNameByRgb } from '../utils/colors';

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
  seq?: string; // e.g. "1/1" for 1-of-1 assets
  spot?: string;
  color?: string;
  spot_color_pairs?: SpotColorPair[]; // For PARALLEL cards with multiple combinations
  vfx?: string;
  chrome: string | boolean;
  foilfractor?: boolean; // When true, show a gold "foilfractor" pill next to type
  diecut?: string; // When set, show a red "DIECUT" pill next to type with the value
  oneOfOneWp?: boolean; // For BASE assets with superfractor chrome
  wp_inv_layer?: string; // For chrome effects
  wp?: string; // For VFX effects (wp layer, v20+)
  // Coldfoil/foil objects rendered under Layers
  coldfoil?: {
    coldfoil_layer?: string;
    coldfoil_color?: string; // e.g., 'silver' | 'gold' or RGB like RxxxGxxxBxxx
  };
  foil?:
    | boolean
    | {
        foil_layer?: string;
        foil_color?: string; // optional; default display to 'silver' if absent
      };
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
  onRetryFailedAssets?: () => Promise<void>;
  onAssetsUpdate?: (updatedAssets: { job_id: string; assets: any; _cacheTimestamp?: number } | { _forceRefetch: true; job_id: string }) => void;
  onEDRPdfUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onAddAsset?: () => void;
}

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
  onRetryFailedAssets,
  onAssetsUpdate,
  onEDRPdfUpload,
  onAddAsset
}: AssetsTableProps) => {
  // Advanced options state
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  
  // Show EDR import only for physical_to_digital jobs
  const jobTypeRaw = (jobData as any)?.job_type || '';
  const jobType = typeof jobTypeRaw === 'string' ? jobTypeRaw.toLowerCase() : '';
  const showEdrImport = jobType === 'physical_to_digital';
  
  // Use centralized data store for asset mutations
  const { mutate: bulkUpdateAssetsMutation } = useAppDataStore('jobAssets', { 
    jobId: jobData?.job_id || '', 
    autoRefresh: false 
  });



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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3 style={{
            fontSize: 20,
            fontWeight: 600,
            color: '#f8f8f8',
            margin: 0
          }}>
            Assets to Generate ({configuredAssets.length})
          </h3>
          <button
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            disabled={savingAsset || creatingAssets || processingPdf}
            style={{
              width: 32,
              height: 32,
              background: showAdvancedOptions 
                ? 'rgba(59, 130, 246, 0.2)' 
                : 'rgba(255, 255, 255, 0.05)',
              border: '1px solid ' + (showAdvancedOptions 
                ? 'rgba(59, 130, 246, 0.4)' 
                : 'rgba(255, 255, 255, 0.1)'),
              borderRadius: 8,
              color: showAdvancedOptions ? '#60a5fa' : '#9ca3af',
              fontSize: 16,
              cursor: (savingAsset || creatingAssets || processingPdf) ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              opacity: (savingAsset || creatingAssets || processingPdf) ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (!savingAsset && !creatingAssets && !processingPdf) {
                if (!showAdvancedOptions) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.color = '#d1d5db';
                }
              }
            }}
            onMouseLeave={(e) => {
              if (!savingAsset && !creatingAssets && !processingPdf) {
                if (!showAdvancedOptions) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.color = '#9ca3af';
                }
              }
            }}
            title="Advanced Options"
          >
            ⚙️
          </button>
        </div>
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
          {showEdrImport && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Advanced Options Panel */}
      <AssetAdvancedOptions
        configuredAssets={configuredAssets}
        savingAsset={savingAsset}
        creatingAssets={creatingAssets}
        processingPdf={processingPdf}
        jobData={jobData}
        getWpInvLayers={getWpInvLayers}
        onAssetsUpdate={onAssetsUpdate}
        isVisible={showAdvancedOptions}
      />

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
                <th style={{ 
                  padding: '12px 14px', 
                  textAlign: 'center', 
                  color: '#f8f8f8', 
                  fontSize: 14, 
                  fontWeight: 600, 
                  letterSpacing: '0.05em'
                }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                          {asset.foilfractor && (
                            <span style={{
                              background: 'rgba(245, 158, 11, 0.2)', // gold-like background
                              color: '#fbbf24', // gold text
                              padding: '2px 6px',
                              borderRadius: 3,
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: '0.02em',
                              alignSelf: 'flex-start'
                            }}>
                              FOILFRACTOR
                            </span>
                          )}
                          {asset.diecut && (
                            <span style={{
                              background: 'rgba(239, 68, 68, 0.2)',
                              color: '#f87171',
                              padding: '2px 6px',
                              borderRadius: 3,
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: '0.02em',
                              alignSelf: 'flex-start'
                            }}>
                              DIECUT: {asset.diecut}
                            </span>
                          )}
                          {asset.seq === '1/1' && (
                            <span style={{
                              background: 'rgba(16, 185, 129, 0.18)', // emerald-like background
                              color: '#34d399', // emerald text
                              padding: '2px 6px',
                              borderRadius: 3,
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: '0.02em',
                              alignSelf: 'flex-start',
                              border: '1px solid rgba(16, 185, 129, 0.25)'
                            }}>
                              1/1
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#e5e7eb', fontSize: 14, textAlign: 'left' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                        {/* Show asset layer first */}
                        {asset.layer && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                            <span style={{
                              fontSize: 14,
                              color: '#e5e7eb'
                            }}>
                              {asset.layer}
                            </span>
                            {asset.wp && (
                              <span style={{
                                fontSize: 14,
                                color: '#e5e7eb'
                              }}>
                                {asset.wp}
                              </span>
                            )}
                            {asset.wp_inv_layer && (
                              <span style={{
                                fontSize: 14,
                                color: '#e5e7eb'
                              }}>
                                {asset.wp_inv_layer}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Coldfoil layer and color (default to silver) */}
                        {asset.coldfoil?.coldfoil_layer && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, justifyContent: 'flex-start' }}>
                            <span style={{
                              fontSize: 14,
                              color: '#e5e7eb'
                            }}>
                              {asset.coldfoil.coldfoil_layer}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                background: asset.coldfoil?.coldfoil_color?.startsWith('R')
                                  ? getColorHexByRgb(asset.coldfoil.coldfoil_color as string)
                                  : getColorHexByName((asset.coldfoil?.coldfoil_color || 'silver') as string),
                                display: 'inline-block',
                                border: '1px solid rgba(255, 255, 255, 0.2)'
                              }} />
                            </div>
                          </div>
                        )}

                        {/* Foil layer and color (default to silver) */}
                        {typeof asset.foil === 'object' && asset.foil !== null && (asset.foil as { foil_layer?: string; foil_color?: string })?.foil_layer && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, justifyContent: 'flex-start' }}>
                            <span style={{
                              fontSize: 14,
                              color: '#e5e7eb'
                            }}>
                              {(asset.foil as { foil_layer?: string; foil_color?: string }).foil_layer}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                background: ((asset.foil as { foil_layer?: string; foil_color?: string }).foil_color as string | undefined)?.startsWith('R')
                                  ? getColorHexByRgb((asset.foil as { foil_layer?: string; foil_color?: string }).foil_color as string)
                                  : getColorHexByName((((asset.foil as { foil_layer?: string; foil_color?: string }).foil_color as string | undefined) || 'silver') as string),
                                display: 'inline-block',
                                border: '1px solid rgba(255, 255, 255, 0.2)'
                              }} />
                            </div>
                          </div>
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
                        {!asset.layer && (!asset.spot_color_pairs || asset.spot_color_pairs.length === 0) && !asset.spot && !asset.coldfoil?.coldfoil_layer && !(typeof asset.foil === 'object' && asset.foil !== null && (asset.foil as { foil_layer?: string }).foil_layer) && (
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
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
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
            
            {/* Retry Failed Assets Button - only show when status is generation-failed */}
            {jobData?.job_status?.toLowerCase() === 'generation-failed' && onRetryFailedAssets && (
              <button
                onClick={onRetryFailedAssets}
                disabled={creatingAssets || !canCreateAssets}
                style={{
                  padding: '16px 36px',
                  background: creatingAssets 
                    ? 'rgba(156, 163, 175, 0.5)' 
                    : 'linear-gradient(135deg, #f59e0b, #d97706)',
                  border: 'none',
                  borderRadius: 12,
                  color: 'white',
                  fontSize: 18,
                  fontWeight: 600,
                  cursor: creatingAssets ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: creatingAssets ? 'none' : '0 8px 24px rgba(245, 158, 11, 0.3)'
                }}
                onMouseEnter={(e) => {
                  if (!creatingAssets) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #d97706, #b45309)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!creatingAssets) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
                  }
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
                    Retrying Assets...
                  </div>
                ) : (
                  `🔄 Retry Failed Assets`
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
