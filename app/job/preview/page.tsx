'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Head from 'next/head';
import NavBar from '../../../components/NavBar';
import styles from '../../../styles/Edit.module.css';

// Preload UTIF for better performance
let utifModule: any = null;
const loadUTIF = async () => {
  if (!utifModule && typeof window !== 'undefined') {
    try {
      utifModule = await import('utif');
      console.log('📦 UTIF library preloaded successfully');
    } catch (error) {
      console.error('❌ Failed to preload UTIF library:', error);
    }
  }
  return utifModule;
};

interface AssetItem {
  filename: string;
  job_id: string;
  status: string;
  spot_number?: string;
  color_variant?: string;
  presignedUrl?: string;
  isTiff?: boolean;
  error?: string;
}

// Color conversion helper functions
function convertCMYKtoRGB(cmykData: ArrayBuffer | Uint8Array, pixelCount: number): Uint8ClampedArray {
  const cmyk = new Uint8Array(cmykData);
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  
  for (let i = 0; i < pixelCount; i++) {
    const c = cmyk[i * 4] / 255;
    const m = cmyk[i * 4 + 1] / 255;
    const y = cmyk[i * 4 + 2] / 255;
    const k = cmyk[i * 4 + 3] / 255;
    
    // CMYK to RGB conversion
    const r = Math.round(255 * (1 - c) * (1 - k));
    const g = Math.round(255 * (1 - m) * (1 - k));
    const b = Math.round(255 * (1 - y) * (1 - k));
    
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255; // Alpha
  }
  
  return rgba;
}

function addAlphaChannel(rgbData: ArrayBuffer | Uint8Array, pixelCount: number): Uint8ClampedArray {
  const rgb = new Uint8Array(rgbData);
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  
  for (let i = 0; i < pixelCount; i++) {
    rgba[i * 4] = rgb[i * 3];     // R
    rgba[i * 4 + 1] = rgb[i * 3 + 1]; // G
    rgba[i * 4 + 2] = rgb[i * 3 + 2]; // B
    rgba[i * 4 + 3] = 255;        // A
  }
  
  return rgba;
}

function convertGrayscaleToRGBA(grayData: ArrayBuffer | Uint8Array, pixelCount: number): Uint8ClampedArray {
  const gray = new Uint8Array(grayData);
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  
  for (let i = 0; i < pixelCount; i++) {
    const grayValue = gray[i];
    rgba[i * 4] = grayValue;     // R
    rgba[i * 4 + 1] = grayValue; // G
    rgba[i * 4 + 2] = grayValue; // B
    rgba[i * 4 + 3] = 255;       // A
  }
  
  return rgba;
}

// Component to handle TIFF image display with client-side conversion
function TiffViewer({ src, alt, style, onError }: { 
  src: string; 
  alt: string; 
  style: React.CSSProperties; 
  onError: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadTiff = async () => {
      try {
        setLoading(true);
        setError(false);
        
        console.log(`🖼️ Loading TIFF: ${alt} from ${src}`);

        // Create proxy URL to avoid CORS issues
        const proxyUrl = `/api/tiff-proxy?url=${encodeURIComponent(src)}`;
        console.log(`🔗 Original TIFF URL: ${src}`);
        console.log(`🔗 Using proxy URL: ${proxyUrl}`);
        
        // First, try native browser support with proxy to avoid CORS
        const testImg = new Image();
        testImg.crossOrigin = 'anonymous';
        
        const nativeSupport = await new Promise<boolean>((resolve) => {
          testImg.onload = () => {
            console.log(`✅ Native TIFF support via proxy for: ${alt}`);
            resolve(true);
          };
          testImg.onerror = () => {
            console.log(`❌ No native TIFF support for: ${alt}, trying UTIF conversion`);
            resolve(false);
          };
          testImg.src = proxyUrl;
          
          // Timeout after 3 seconds
          setTimeout(() => resolve(false), 3000);
        });

        if (nativeSupport) {
          setImageUrl(proxyUrl);
          setLoading(false);
          return;
        }

        // Fetch TIFF data for conversion using proxy to avoid CORS issues
        console.log(`📥 Fetching TIFF data for conversion: ${alt}`);
        
        const response = await fetch(proxyUrl);
        if (!response.ok) {
          console.error(`❌ TIFF fetch failed for ${alt}:`, {
            status: response.status,
            statusText: response.statusText,
            url: src,
            headers: Object.fromEntries(response.headers.entries())
          });
          throw new Error(`Failed to fetch TIFF: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        console.log(`📊 TIFF data size: ${arrayBuffer.byteLength} bytes for ${alt}`);

        // Try to decode with UTIF and create a blob URL
        if (typeof window !== 'undefined') {
          try {
            // Use preloaded UTIF or load dynamically with better error handling
            console.log(`📦 Attempting to load UTIF library for: ${alt}`);
            const UTIF = utifModule || await loadUTIF();
            
            if (!UTIF) {
              throw new Error('UTIF library not available - this might be a bundling issue on Vercel');
            }
            
            console.log(`🔧 Decoding TIFF with UTIF: ${alt}`);
            
            let ifds;
            try {
              ifds = UTIF.decode(arrayBuffer);
            } catch (decodeError) {
              console.error(`❌ UTIF decode failed for ${alt}:`, decodeError);
              throw new Error(`TIFF decode failed: ${decodeError.message}`);
            }
            
            if (ifds && ifds.length > 0) {
              console.log(`📋 Found ${ifds.length} IFD(s) in TIFF: ${alt}`);
              
              // Decode the first image
              try {
                UTIF.decodeImage(arrayBuffer, ifds[0]);
              } catch (decodeImageError) {
                console.error(`❌ UTIF decodeImage failed for ${alt}:`, decodeImageError);
                throw new Error(`TIFF image decode failed: ${decodeImageError.message}`);
              }
              
              const ifd = ifds[0];
              
              if (ifd.width && ifd.height && ifd.data) {
                console.log(`🎨 Converting TIFF to canvas: ${ifd.width}x${ifd.height} for ${alt}`);
                console.log(`📊 TIFF info - Photometric: ${ifd.t262?.[0]}, BitsPerSample: ${ifd.t258}, SamplesPerPixel: ${ifd.t277?.[0]}`);
                
                // Create a temporary canvas to render the image
                const canvas = document.createElement('canvas');
                canvas.width = ifd.width;
                canvas.height = ifd.height;
                const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
                
                if (ctx) {
                  // Handle different color spaces and bit depths
                  let processedData = new Uint8ClampedArray(ifd.data);
                  
                  // Check if this is CMYK data (photometric interpretation = 5)
                  if (ifd.t262?.[0] === 5) {
                    console.log(`🎨 Converting CMYK to RGB for: ${alt}`);
                    processedData = convertCMYKtoRGB(ifd.data, ifd.width * ifd.height);
                  }
                  // Check if this is RGB data without alpha
                  else if (ifd.t277?.[0] === 3) {
                    console.log(`🎨 Adding alpha channel to RGB for: ${alt}`);
                    processedData = addAlphaChannel(ifd.data, ifd.width * ifd.height);
                  }
                  // Check if this is grayscale
                  else if (ifd.t262?.[0] === 1) {
                    console.log(`🎨 Converting grayscale to RGBA for: ${alt}`);
                    processedData = convertGrayscaleToRGBA(ifd.data, ifd.width * ifd.height);
                  }
                  
                  // Create ImageData and draw to canvas
                  const imageData = new ImageData(processedData, ifd.width, ifd.height);
                  ctx.putImageData(imageData, 0, 0);
                  
                  // Convert canvas to blob and create URL
                  canvas.toBlob((blob) => {
                    if (blob) {
                      const url = URL.createObjectURL(blob);
                      setImageUrl(url);
                      setLoading(false);
                      console.log(`✅ TIFF converted successfully for: ${alt}`);
                    } else {
                      throw new Error('Failed to create blob from canvas');
                    }
                  }, 'image/png');
                }
              }
            }
          } catch (utifError) {
            console.error(`❌ UTIF processing failed for ${alt}:`, utifError);
            throw utifError;
          }
        }
      } catch (error) {
        console.error(`❌ TIFF load failed for ${alt}:`, error);
        setError(true);
        setLoading(false);
        onError();
      }
    };

    loadTiff();
  }, [src, alt]);

  if (loading) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' }}>
        <div>Loading TIFF...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' }}>
        <div style={{ color: '#ef4444' }}>Failed to load TIFF</div>
      </div>
    );
  }

  return imageUrl ? (
    <img
      src={imageUrl}
      alt={alt}
      style={style}
      onError={() => {
        setError(true);
        onError();
      }}
    />
  ) : null;
}

function JobPreviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId');
  
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingUrls, setLoadingUrls] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [selectedAsset, setSelectedAsset] = useState<AssetItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalZoom, setModalZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const modalImageRef = useRef<HTMLImageElement>(null);

  const loadAssets = async () => {
    if (!jobId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`🔍 Loading assets for job: ${jobId}`);
      
      const response = await fetch(`/api/firefly-proxy?job_id=${jobId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load assets: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📊 Raw assets data:', data);
      
      if (data.assets && Array.isArray(data.assets)) {
        const processedAssets = data.assets.map((asset: any) => ({
          filename: asset.filename || 'Unknown',
          job_id: asset.job_id || jobId,
          status: asset.status || 'Unknown',
          spot_number: asset.spot_number,
          color_variant: asset.color_variant,
          isTiff: asset.filename && asset.filename.toLowerCase().endsWith('.tiff')
        }));
        
        console.log(`✅ Loaded ${processedAssets.length} assets for job ${jobId}`);
        setAssets(processedAssets);
      } else {
        console.warn('⚠️ No assets found in response');
        setAssets([]);
      }
    } catch (err) {
      console.error('❌ Error loading assets:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const getPresignedUrl = async (asset: AssetItem) => {
    if (asset.presignedUrl) return asset.presignedUrl;
    
    setLoadingUrls(prev => new Set(prev).add(asset.filename));
    
    try {
      console.log(`🔗 Getting presigned URL for: ${asset.filename}`);
      
      const response = await fetch(`/api/firefly-proxy?job_id=${asset.job_id}&filename=${encodeURIComponent(asset.filename)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get presigned URL: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`📎 Got presigned URL for ${asset.filename}:`, data.presigned_url ? 'Success' : 'Failed');
      
      if (data.presigned_url) {
        // Update the asset with the presigned URL
        setAssets(prev => prev.map(a => 
          a.filename === asset.filename 
            ? { ...a, presignedUrl: data.presigned_url }
            : a
        ));
        return data.presigned_url;
      } else {
        throw new Error('No presigned URL received');
      }
    } catch (err) {
      console.error(`❌ Error getting presigned URL for ${asset.filename}:`, err);
      
      // Update the asset with error state
      setAssets(prev => prev.map(a => 
        a.filename === asset.filename 
          ? { ...a, error: (err as Error).message }
          : a
      ));
      
      throw err;
    } finally {
      setLoadingUrls(prev => {
        const newSet = new Set(prev);
        newSet.delete(asset.filename);
        return newSet;
      });
    }
  };

  const handleAssetClick = async (asset: AssetItem) => {
    try {
      if (!asset.presignedUrl) {
        await getPresignedUrl(asset);
      }
      setSelectedAsset(asset);
      setShowModal(true);
      setModalZoom(1);
      setDragOffset({ x: 0, y: 0 });
    } catch (err) {
      console.error('Failed to load asset:', err);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (modalZoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && modalZoom > 1) {
      setDragOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setModalZoom(prev => Math.min(prev * 1.5, 5));
  };

  const handleZoomOut = () => {
    setModalZoom(prev => Math.max(prev / 1.5, 0.5));
    if (modalZoom <= 1) {
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const resetZoom = () => {
    setModalZoom(1);
    setDragOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    if (jobId) {
      loadAssets();
    }
  }, [jobId]);

  useEffect(() => {
    // Preload UTIF library
    loadUTIF();
  }, []);

  const goBack = () => {
    router.push('/jobs');
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedAsset(null);
    setModalZoom(1);
    setDragOffset({ x: 0, y: 0 });
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <NavBar title="Job Preview" />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div>Loading assets...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <NavBar title="Job Preview" />
        <div className={styles.content}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <h2 style={{ color: '#ef4444', marginBottom: '20px' }}>Error Loading Assets</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>{error}</p>
            <button 
              onClick={loadAssets}
              style={{
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                marginRight: '10px'
              }}
            >
              Retry
            </button>
            <button 
              onClick={goBack}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Back to Jobs
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Job Preview - Asset Generation</title>
      </Head>
      
      <div className={styles.container}>
        <NavBar title="Job Preview" />
        <div className={styles.content}>
          <div style={{ marginBottom: '20px' }}>
            <button 
              onClick={goBack}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              ← Back to Jobs
            </button>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h2>Digital Assets Preview</h2>
            <p style={{ color: '#666' }}>
              Job ID: {jobId} • {assets.length} assets
            </p>
          </div>

          {assets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p style={{ color: '#666' }}>No assets found for this job.</p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '20px',
              padding: '20px 0'
            }}>
              {assets.map((asset, index) => (
                <div
                  key={index}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '16px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                  }}
                  onClick={() => handleAssetClick(asset)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <div style={{ marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                      {asset.filename}
                    </h3>
                    <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>
                      Status: {asset.status}
                    </p>
                    {asset.spot_number && (
                      <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>
                        Spot: {asset.spot_number}
                      </p>
                    )}
                    {asset.color_variant && (
                      <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>
                        Color: {asset.color_variant}
                      </p>
                    )}
                  </div>

                  <div style={{
                    height: '200px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden'
                  }}>
                    {loadingUrls.has(asset.filename) ? (
                      <div>Loading...</div>
                    ) : asset.error ? (
                      <div style={{ color: '#ef4444', textAlign: 'center' }}>
                        <div>Failed to load</div>
                        <div style={{ fontSize: '12px', marginTop: '4px' }}>
                          {asset.error}
                        </div>
                      </div>
                    ) : asset.presignedUrl ? (
                      asset.isTiff ? (
                        <TiffViewer
                          src={asset.presignedUrl}
                          alt={asset.filename}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain'
                          }}
                          onError={() => {
                            setAssets(prev => prev.map(a => 
                              a.filename === asset.filename 
                                ? { ...a, error: 'Failed to load TIFF' }
                                : a
                            ));
                          }}
                        />
                      ) : (
                        <img
                          src={asset.presignedUrl}
                          alt={asset.filename}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain'
                          }}
                          onError={() => {
                            setAssets(prev => prev.map(a => 
                              a.filename === asset.filename 
                                ? { ...a, error: 'Failed to load image' }
                                : a
                            ));
                          }}
                        />
                      )
                    ) : (
                      <div style={{ color: '#666' }}>Click to load preview</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal for enlarged view */}
      {showModal && selectedAsset && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={closeModal}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Controls */}
            <div style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              display: 'flex',
              gap: '10px',
              zIndex: 1001
            }}>
              <button
                onClick={handleZoomOut}
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                -
              </button>
              <button
                onClick={resetZoom}
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {Math.round(modalZoom * 100)}%
              </button>
              <button
                onClick={handleZoomIn}
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                +
              </button>
              <button
                onClick={closeModal}
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
            </div>

            {/* Image */}
            <div
              style={{
                cursor: modalZoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                userSelect: 'none'
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {selectedAsset.presignedUrl && (
                selectedAsset.isTiff ? (
                  <TiffViewer
                    src={selectedAsset.presignedUrl}
                    alt={selectedAsset.filename}
                    style={{
                      maxWidth: '90vw',
                      maxHeight: '90vh',
                      transform: `scale(${modalZoom}) translate(${dragOffset.x}px, ${dragOffset.y}px)`,
                      transformOrigin: 'center',
                      transition: isDragging ? 'none' : 'transform 0.2s'
                    }}
                    onError={() => {}}
                  />
                ) : (
                  <img
                    ref={modalImageRef}
                    src={selectedAsset.presignedUrl}
                    alt={selectedAsset.filename}
                    style={{
                      maxWidth: '90vw',
                      maxHeight: '90vh',
                      transform: `scale(${modalZoom}) translate(${dragOffset.x}px, ${dragOffset.y}px)`,
                      transformOrigin: 'center',
                      transition: isDragging ? 'none' : 'transform 0.2s'
                    }}
                    onError={() => {}}
                  />
                )
              )}
            </div>

            {/* Asset info */}
            <div style={{
              position: 'absolute',
              bottom: '10px',
              left: '10px',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              padding: '10px',
              borderRadius: '4px'
            }}>
              <div style={{ fontWeight: 'bold' }}>{selectedAsset.filename}</div>
              <div style={{ fontSize: '14px' }}>Status: {selectedAsset.status}</div>
              {selectedAsset.spot_number && (
                <div style={{ fontSize: '14px' }}>Spot: {selectedAsset.spot_number}</div>
              )}
              {selectedAsset.color_variant && (
                <div style={{ fontSize: '14px' }}>Color: {selectedAsset.color_variant}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function JobPreviewPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <JobPreviewContent />
    </Suspense>
  );
} 