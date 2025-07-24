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

export const PSDTemplateSelector = ({ jobData, mergedJobData, isVisible, creatingAssets, setCreatingAssets }: PSDTemplateSelectorProps) => {
  const router = useRouter();
  
  // State management
  const [physicalJsonFiles, setPhysicalJsonFiles] = useState<PSDFile[]>([]);
  const [loadingPhysicalFiles, setLoadingPhysicalFiles] = useState(false);
  const [selectedPhysicalFile, setSelectedPhysicalFile] = useState<string>('');
  const [jsonData, setJsonData] = useState<any>(null);
  const [loadingJsonData, setLoadingJsonData] = useState(false);
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(new Set());
  const [selectedExtractedLayers, setSelectedExtractedLayers] = useState<Set<string>>(new Set());

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
    // Clear selected layers when changing files
    setSelectedLayers(new Set());
    setSelectedExtractedLayers(new Set());
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
    if (!selectedExtractedLayers.size) return;

    console.log('🎨 Creating digital assets with selected options:', {
      selectedFile: selectedPhysicalFile,
      psdFile: jsonData?.psd_file,
      selectedLayers: Array.from(selectedLayers),
      selectedExtractedLayers: Array.from(selectedExtractedLayers),
      totalColors: selectedLayers.size,
      totalLayers: selectedExtractedLayers.size,
    });

    setCreatingAssets(true);

    try {
      const psdFile = selectedPhysicalFile.split('/').pop()?.replace('.json', '.psd') || '';
      const layers = Array.from(selectedExtractedLayers);
      
      // Check if any selected layer contains "spot"
      const hasSpotLayer = layers.some(layerName => 
        layerName.toLowerCase().includes('spot')
      );

      const colors = hasSpotLayer 
        ? Array.from(selectedLayers).map((layerId) => {
            const [id, name] = layerId.split('-');
            return {
              id: parseInt(id, 10),
              name: name || layerId
            };
          })
        : [];

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

  if (!isVisible) return null;

  const extractedLayers = getExtractedLayers();
  const colorVariants = getColorVariants();
  const hasSpotLayer = Array.from(selectedExtractedLayers).some(layerName => 
    layerName.toLowerCase().includes('spot')
  );
  const canCreateAssets = selectedExtractedLayers.size > 0 && (
    !hasSpotLayer || (hasSpotLayer && selectedLayers.size > 0)
  );

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
          <div>
            <label style={{
              display: 'block',
              fontSize: 16,
              fontWeight: 600,
              color: '#f8f8f8',
              marginBottom: 12
            }}>
              Select PSD
            </label>
            {loadingPhysicalFiles ? (
              <div style={{
                width: '100%',
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
                  width: '100%',
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

          {/* Layer and Color Selection */}
          {selectedPhysicalFile && jsonData && !loadingJsonData && (
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
              {/* Layer Selection */}
              <div style={{ maxWidth: 250 }}>
                <label style={{
                  display: 'block',
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#f8f8f8',
                  marginBottom: 12
                }}>
                  Select Layers
                </label>
                {extractedLayers.length > 0 ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    maxWidth: 250
                  }}>
                    {extractedLayers.map((layerName, index) => (
                      <label key={index} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        fontSize: 13,
                        color: '#f8f8f8',
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: 6,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        transition: 'background-color 0.2s'
                      }}>
                        <input
                          type="checkbox"
                          checked={selectedExtractedLayers.has(layerName)}
                          onChange={() => {
                            const newSelected = new Set(selectedExtractedLayers);
                            if (newSelected.has(layerName)) {
                              newSelected.delete(layerName);
                            } else {
                              newSelected.add(layerName);
                            }
                            setSelectedExtractedLayers(newSelected);
                          }}
                          style={{
                            width: 14,
                            height: 14,
                            cursor: 'pointer',
                            flexShrink: 0
                          }}
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {layerName}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    fontSize: 14,
                    color: '#9ca3af',
                    fontStyle: 'italic'
                  }}>
                    No extracted layers available
                  </div>
                )}
              </div>

              {/* Color Variants Selection */}
              {hasSpotLayer && (
                <div style={{ maxWidth: 200 }}>
                  <label style={{
                    display: 'block',
                    fontSize: 16,
                    fontWeight: 600,
                    color: '#f8f8f8',
                    marginBottom: 12
                  }}>
                    Select Color Variants
                  </label>
                  {colorVariants.length > 0 ? (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      maxWidth: 200
                    }}>
                      {colorVariants.map((layer: any, index: number) => {
                        const layerId = `${layer.id}-${layer.name}`;
                        const isSelected = selectedLayers.has(layerId);
                        
                        return (
                          <label key={index} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            fontSize: 13,
                            color: '#f8f8f8',
                            padding: '8px 12px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: 6,
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            transition: 'background-color 0.2s'
                          }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                const newSelected = new Set(selectedLayers);
                                if (newSelected.has(layerId)) {
                                  newSelected.delete(layerId);
                                } else {
                                  newSelected.add(layerId);
                                }
                                setSelectedLayers(newSelected);
                              }}
                              style={{
                                width: 14,
                                height: 14,
                                cursor: 'pointer',
                                flexShrink: 0
                              }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {layer.name || `Layer ${layer.id || index + 1}`}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{
                      fontSize: 14,
                      color: '#9ca3af',
                      fontStyle: 'italic'
                    }}>
                      No color variants available
                    </div>
                  )}
                </div>
              )}

              {/* Create Assets Button */}
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                marginTop: 32
              }}>
                <button
                  onClick={createAssets}
                  disabled={creatingAssets || !canCreateAssets}
                  style={{
                    padding: '16px 32px',
                    background: creatingAssets 
                      ? 'rgba(156, 163, 175, 0.5)' 
                      : !canCreateAssets
                      ? 'rgba(156, 163, 175, 0.3)'
                      : 'linear-gradient(135deg, #10b981, #059669)',
                    border: 'none',
                    borderRadius: 12,
                    color: 'white',
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: creatingAssets || !canCreateAssets ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: creatingAssets || !canCreateAssets
                      ? 'none' 
                      : '0 8px 24px rgba(16, 185, 129, 0.3)',
                    minHeight: 60,
                    opacity: !canCreateAssets ? 0.6 : 1
                  }}
                >
                  {creatingAssets ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 16,
                        height: 16,
                        border: '2px solid rgba(255, 255, 255, 0.3)',
                        borderTop: '2px solid white',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }} />
                      Creating...
                    </div>
                  ) : (
                    '🎨 Create Assets'
                  )}
                </button>
                <div style={{
                  fontSize: 12,
                  color: '#9ca3af',
                  marginTop: 8
                }}>
                  {!canCreateAssets ? (
                    hasSpotLayer ? 
                      `Select ${selectedLayers.size} colors and ${selectedExtractedLayers.size} layers` :
                      `Select ${selectedExtractedLayers.size} layers`
                  ) : (
                    `${hasSpotLayer ? `${selectedLayers.size} colors • ` : ''}${selectedExtractedLayers.size} layers`
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>


    </>
  );
}; 