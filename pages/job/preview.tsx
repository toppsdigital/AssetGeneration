import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import NavBar from '../../components/NavBar';
import styles from '../../styles/Edit.module.css';

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
                  const photometric = ifd.t262?.[0];
                  const samplesPerPixel = ifd.t277?.[0] || 4;
                  
                  if (photometric === 5 && samplesPerPixel >= 4) {
                    console.log(`🎨 Converting CMYK to RGB for: ${alt}`);
                    // Simple CMYK to RGB conversion
                    processedData = convertCMYKtoRGB(ifd.data, ifd.width * ifd.height);
                  } else if (samplesPerPixel === 3) {
                    console.log(`🎨 Processing RGB data for: ${alt}`);
                    // Convert RGB to RGBA
                    processedData = addAlphaChannel(ifd.data, ifd.width * ifd.height);
                  } else if (samplesPerPixel === 1) {
                    console.log(`🎨 Converting grayscale to RGB for: ${alt}`);
                    // Convert grayscale to RGBA
                    processedData = convertGrayscaleToRGBA(ifd.data, ifd.width * ifd.height);
                  }
                  
                  // Create ImageData and draw to canvas
                  const imageData = new ImageData(
                    processedData, 
                    ifd.width, 
                    ifd.height
                  );
                  ctx.putImageData(imageData, 0, 0);
                  
                  // Convert canvas to blob URL with higher quality
                  canvas.toBlob((blob) => {
                    if (blob) {
                      const url = URL.createObjectURL(blob);
                      console.log(`✅ TIFF successfully converted to blob URL with color correction: ${alt}`);
                      setImageUrl(url);
                      setLoading(false);
                    } else {
                      throw new Error('Failed to create blob from canvas');
                    }
                  }, 'image/png', 1.0);
                  return;
                } else {
                  throw new Error('Failed to get canvas context');
                }
              } else {
                console.warn(`❌ IFD data missing for: ${alt}`);
                console.log('IFD dimensions:', ifd.width, 'x', ifd.height, 'Data length:', ifd.data?.length);
                throw new Error('IFD data missing');
              }
            } else {
              console.warn(`❌ No IFDs found in TIFF: ${alt}`);
              throw new Error('No image data found in TIFF');
            }
          } catch (tiffError) {
            console.error(`❌ UTIF conversion failed for ${alt}:`, tiffError);
            throw tiffError;
          }
        } else {
          throw new Error('Window object not available');
        }
        
      } catch (err) {
        console.error(`❌ Failed to load TIFF ${alt}:`, err);
        setError(true);
        setLoading(false);
        onError();
      }
    };

    loadTiff();
  }, [src, alt, onError]);

  // Cleanup blob URL when component unmounts
  useEffect(() => {
    return () => {
      if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  if (loading) {
    return (
      <div style={{
        width: '100%',
        height: 200,
        background: 'rgba(107, 114, 128, 0.2)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9ca3af'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🔄</div>
          <div style={{ fontSize: 12 }}>Converting TIFF...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        width: '100%',
        height: 300,
        background: 'rgba(107, 114, 128, 0.2)',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9ca3af',
        cursor: 'pointer',
        transition: 'all 0.2s'
      }}
      onClick={() => {
        console.log(`🔗 Opening TIFF in new tab: ${src}`);
        window.open(src, '_blank');
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(107, 114, 128, 0.3)';
        e.currentTarget.style.transform = 'scale(1.02)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(107, 114, 128, 0.2)';
        e.currentTarget.style.transform = 'scale(1)';
      }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🖼️</div>
        <div style={{ fontSize: 16, textAlign: 'center', fontWeight: 600, marginBottom: 8 }}>
          TIFF Layer
        </div>
        <div style={{ fontSize: 12, textAlign: 'center', color: '#60a5fa', textDecoration: 'underline', marginBottom: 12 }}>
          Click to view full size
        </div>
        <div style={{ 
          fontSize: 11, 
          textAlign: 'center', 
          color: '#6b7280',
          wordBreak: 'break-all',
          maxWidth: '80%'
        }}>
          {alt}
        </div>
      </div>
    );
  }

  // Show converted image
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={alt}
        style={{
          width: '100%',
          height: 'auto',
          maxHeight: '400px',
          objectFit: 'contain',
          display: 'block'
        }}
        onError={() => {
          console.error(`❌ Converted image failed to display: ${alt}`);
          setError(true);
        }}
      />
    );
  }

  return null;
}

export default function JobPreviewPage() {
  const router = useRouter();
  const { jobPath, fileName, type, filePaths } = router.query;
  
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<{
    src: string;
    alt: string;
    isTiff: boolean;
  } | null>(null);

  useEffect(() => {
    if (jobPath && fileName && type) {
      loadAssets();
    }
  }, [jobPath, fileName, type, filePaths]);

  // Preload UTIF library when component mounts
  useEffect(() => {
    loadUTIF();
  }, []);

  const loadAssets = async () => {
    try {
      setLoading(true);
      
      if (!jobPath || !fileName || !type) {
        setError('Missing required parameters');
        return;
      }

      setDisplayName(fileName as string);
      
      // Parse the actual file paths passed from details page
      if (!filePaths) {
        setError('No file paths provided');
        return;
      }

      let actualFilePaths: string[] = [];
      try {
        actualFilePaths = JSON.parse(decodeURIComponent(filePaths as string));
        console.log(`🎯 Using actual file paths:`, actualFilePaths);
      } catch (error) {
        console.error(`❌ Failed to parse filePaths parameter:`, error);
        setError('Invalid file paths parameter');
        return;
      }

      if (actualFilePaths.length === 0) {
        setError(`No ${type} files found`);
        return;
      }

      console.log(`🔍 Loading ${actualFilePaths.length} ${type} files:`, actualFilePaths);
      
      // Generate presigned URLs for each file using the actual file paths
      const assetsWithUrls = await Promise.all(
        actualFilePaths.map(async (filePath: string) => {
          try {
            // Extract filename from the full path for display
            const filename = filePath.split('/').pop() || filePath;
              
            console.log(`🔗 Getting presigned URL for: ${filePath}`);
              
                const response = await fetch('/api/s3-proxy', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    client_method: 'get',
                filename: filePath
                  }),
                });

                if (response.ok) {
                  const data = await response.json();
              console.log(`✅ Got presigned URL for ${filename}: ${data.url}`);
              
              return {
                filename,
                job_id: '',
                status: 'succeeded',
                presignedUrl: data.url,
                isTiff: filename.toLowerCase().endsWith('.tif') || filename.toLowerCase().endsWith('.tiff')
              };
            } else {
              const errorText = await response.text().catch(() => 'Unknown error');
              const errorMessage = `${response.status} ${response.statusText}: ${errorText}`;
              console.error(`❌ Failed to get presigned URL for ${filePath}:`, errorMessage);
              
              return {
                filename,
                job_id: '',
                status: 'failed',
                isTiff: filename.toLowerCase().endsWith('.tif') || filename.toLowerCase().endsWith('.tiff'),
                error: errorMessage
              };
            }
          } catch (error) {
            const filename = filePath.split('/').pop() || filePath;
            console.error(`Error getting presigned URL for ${filePath}:`, error);
            return {
              filename,
              job_id: '',
              status: 'failed',
              isTiff: filename.toLowerCase().endsWith('.tif') || filename.toLowerCase().endsWith('.tiff'),
              error: (error as Error).message
            };
          }
        })
      );

      console.log(`📊 Final assets with URLs:`, assetsWithUrls);
      setAssets(assetsWithUrls);
      
    } catch (error) {
      console.error('Error loading assets:', error);
      setError('Failed to load assets: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const successfulAssets = assets.filter(asset => asset.status === 'succeeded');
  const failedAssets = assets.filter(asset => asset.status === 'failed');

  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <NavBar
          showHome
          onHome={() => router.push('/')}
          title="Loading Assets..."
        />
        <div className={styles.loading}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
          <h2>Loading Generated Assets...</h2>
          <p>Please wait while we fetch your digital assets.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.pageContainer}>
        <NavBar
          showHome
          onHome={() => router.push('/')}
          title="Preview Assets"
        />
        <div className={styles.loading}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <h2>Error Loading Assets</h2>
          <p>{error}</p>
          <button 
            onClick={() => router.push(`/job/details?jobId=${encodeURIComponent(jobPath as string)}`)}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer'
            }}
          >
            Back to Job Details
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Preview {type === 'extracted' ? 'Extracted Layers' : 'Firefly Assets'}</title>
      </Head>
      <div className={styles.pageContainer}>
        <NavBar
          showHome
          onHome={() => router.push('/')}
          showBackToEdit
          onBackToEdit={() => router.push(`/job/details?jobId=${encodeURIComponent(jobPath as string)}`)}
          backLabel="Job Details"
          title={`${displayName} ${type === 'extracted' ? 'Extracted Layers' : 'Generated Assets'}`}
        />
      
      <div className={styles.editContainer}>
        <main className={styles.mainContent}>
          <div style={{
            maxWidth: 1200,
            width: '100%',
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 16,
            padding: 32,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            








            {/* Image Grid */}
            {successfulAssets.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 24,
                marginBottom: 32,
                alignItems: 'start'
              }}>
                {successfulAssets.map((asset, index) => {
                  return (
                  <div
                    key={index}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 12,
                      padding: 16,
                      textAlign: 'center',
                      transition: 'transform 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    {(() => {
                      if (asset.presignedUrl) {
                        return (
                          <div style={{
                            width: '100%',
                            marginBottom: 12,
                            borderRadius: 8,
                            overflow: 'hidden',
                            background: 'rgba(0, 0, 0, 0.2)'
                          }}>
                            <div 
                              onClick={() => setExpandedImage({
                                src: asset.presignedUrl,
                                alt: asset.filename,
                                isTiff: asset.isTiff || false
                              })}
                              style={{
                                cursor: 'pointer',
                                position: 'relative'
                              }}
                            >
                            {asset.isTiff ? (
                              <TiffViewer
                                src={asset.presignedUrl}
                                alt={asset.filename}
                                style={{
                                  width: '100%',
                                  height: 'auto',
                                  maxHeight: '400px',
                                  objectFit: 'contain',
                                  display: 'block'
                                }}
                                onError={() => {
                                  console.warn(`Failed to load TIFF: ${asset.filename}`);
                                }}
                              />
                            ) : (
                              <img
                                src={asset.presignedUrl}
                                alt={asset.filename}
                                style={{
                                  width: '100%',
                                  height: 'auto',
                                  maxHeight: '400px',
                                  objectFit: 'contain',
                                  display: 'block'
                                }}
                                onLoad={() => {
                                  console.log(`✅ Image loaded successfully: ${asset.filename}`);
                                }}
                                onError={(e) => {
                                  console.error(`❌ Image failed to load: ${asset.filename}`, asset.presignedUrl);
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            )}
                              
                              {/* Hover overlay to indicate clickable */}
                              <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'rgba(0, 0, 0, 0.1)',
                                opacity: 0,
                                transition: 'opacity 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontSize: '24px',
                                borderRadius: 8
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.opacity = '1';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = '0';
                              }}
                              >
                                🔍
                              </div>
                            </div>
                          </div>
                        );
                      } else {
                        return (
                          <div style={{
                            width: '100%',
                            height: 200,
                            background: 'rgba(107, 114, 128, 0.2)',
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 12,
                            color: '#9ca3af'
                          }}>
                            📷 Preview unavailable
                          </div>
                        );
                      }
                    })()}
                    
                    <h3 style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: '#f8f8f8',
                      marginBottom: 8,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      width: '100%'
                    }}
                    title={asset.filename}
                    >
                      {asset.filename}
                    </h3>
                    
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem',
                      color: '#9ca3af'
                    }}>
                      {asset.spot_number && (
                        <span>Spot: {asset.spot_number}</span>
                      )}
                      {asset.color_variant && (
                        <span>Variant: {asset.color_variant}</span>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* Failed Assets (if any) */}
            {failedAssets.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <h3 style={{
                  fontSize: '1.2rem',
                  fontWeight: 600,
                  color: '#ef4444',
                  marginBottom: 16
                }}>
                  ❌ Failed Assets
                </h3>
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 12,
                  padding: 16
                }}>
                  {failedAssets.map((asset, index) => (
                    <div key={index} style={{
                      marginBottom: 12,
                      color: '#fca5a5'
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        • {asset.filename}
                      </div>
                      {asset.error && (
                        <div style={{ 
                          fontSize: '0.8rem', 
                          color: '#f87171', 
                          marginLeft: 16,
                          fontFamily: 'monospace'
                        }}>
                          {asset.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No Assets Message */}
            {assets.length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '48px 0',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
                <h3 style={{ color: '#9ca3af', fontSize: 18, marginBottom: 8 }}>No Assets Found</h3>
                <p style={{ color: '#6b7280', fontSize: 14 }}>
                  This job doesn't have any generated assets yet.
                </p>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* Image Expansion Modal */}
      {expandedImage && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setExpandedImage(null)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setExpandedImage(null)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'rgba(0, 0, 0, 0.7)',
                border: 'none',
                borderRadius: '50%',
                width: 40,
                height: 40,
                color: 'white',
                fontSize: '20px',
                cursor: 'pointer',
                zIndex: 1001,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.9)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
              }}
            >
              ✕
            </button>

            {/* Image Content */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '20px'
            }}>
              {expandedImage.isTiff ? (
                <TiffViewer
                  src={expandedImage.src}
                  alt={expandedImage.alt}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '80vh',
                    objectFit: 'contain'
                  }}
                  onError={() => {
                    console.warn(`Failed to load expanded TIFF: ${expandedImage.alt}`);
                  }}
                />
              ) : (
                <img
                  src={expandedImage.src}
                  alt={expandedImage.alt}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '80vh',
                    objectFit: 'contain',
                    display: 'block'
                  }}
                  onError={() => {
                    console.error(`❌ Expanded image failed to load: ${expandedImage.alt}`);
                  }}
                />
              )}
              
              {/* Image Title */}
              <h3 style={{
                color: '#f8f8f8',
                fontSize: '1rem',
                fontWeight: 600,
                marginTop: 16,
                textAlign: 'center',
                wordBreak: 'break-word'
              }}>
                {expandedImage.alt}
              </h3>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
} 