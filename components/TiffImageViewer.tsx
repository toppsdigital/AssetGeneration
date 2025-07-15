import React, { useState, useEffect } from 'react';

interface TiffImageViewerProps {
  src: string;
  alt: string;
  onLoad?: () => void;
  onError?: () => void;
  style?: React.CSSProperties;
  onClick?: () => void;
}

// Singleton UTIF module loading
let utifModule: any = null;
let utifLoadPromise: Promise<any> | null = null;

const loadUTIF = async () => {
  if (!utifLoadPromise && typeof window !== 'undefined') {
    utifLoadPromise = import('utif').then(module => {
      utifModule = module;
      console.log('📦 UTIF library loaded successfully');
      return module;
    }).catch(error => {
      console.error('❌ Failed to load UTIF library:', error);
      throw error;
    });
  }
  return utifLoadPromise;
};

// Color conversion utilities
function convertCMYKtoRGB(cmykData: ArrayBuffer | Uint8Array, pixelCount: number): Uint8ClampedArray {
  const cmyk = new Uint8Array(cmykData);
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  
  for (let i = 0; i < pixelCount; i++) {
    const c = cmyk[i * 4] / 255;
    const m = cmyk[i * 4 + 1] / 255;
    const y = cmyk[i * 4 + 2] / 255;
    const k = cmyk[i * 4 + 3] / 255;
    
    const r = Math.round(255 * (1 - c) * (1 - k));
    const g = Math.round(255 * (1 - m) * (1 - k));
    const b = Math.round(255 * (1 - y) * (1 - k));
    
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  
  return rgba;
}

function addAlphaChannel(rgbData: ArrayBuffer | Uint8Array, pixelCount: number): Uint8ClampedArray {
  const rgb = new Uint8Array(rgbData);
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  
  for (let i = 0; i < pixelCount; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  
  return rgba;
}

function convertGrayscaleToRGBA(grayData: ArrayBuffer | Uint8Array, pixelCount: number): Uint8ClampedArray {
  const gray = new Uint8Array(grayData);
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  
  for (let i = 0; i < pixelCount; i++) {
    const grayValue = gray[i];
    rgba[i * 4] = grayValue;
    rgba[i * 4 + 1] = grayValue;
    rgba[i * 4 + 2] = grayValue;
    rgba[i * 4 + 3] = 255;
  }
  
  return rgba;
}

export default function TiffImageViewer({
  src,
  alt,
  onLoad,
  onError,
  style,
  onClick
}: TiffImageViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    loadTiffImage();
    return () => {
      // Cleanup blob URL on unmount
      if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [src]);

  const loadTiffImage = async () => {
    try {
      setLoading(true);
      setError(false);
      
      console.log('🖼️ Loading TIFF:', alt, 'from', src);

      // Try native browser support first via proxy
      const proxyUrl = `/api/tiff-proxy?url=${encodeURIComponent(src)}`;
      
      const nativeSupport = await new Promise<boolean>((resolve) => {
        const testImg = new Image();
        testImg.crossOrigin = 'anonymous';
        
        testImg.onload = () => {
          console.log('✅ Native TIFF support for:', alt);
          resolve(true);
        };
        testImg.onerror = () => {
          console.log('❌ No native TIFF support for:', alt, ', trying UTIF');
          resolve(false);
        };
        testImg.src = proxyUrl;
        
        setTimeout(() => resolve(false), 3000);
      });

      if (nativeSupport) {
        setImageUrl(proxyUrl);
        setLoading(false);
        onLoad?.();
        return;
      }

      // Fetch TIFF data for conversion
      console.log('📥 Fetching TIFF data for conversion:', alt);
      
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch TIFF: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      console.log('📊 TIFF data size:', arrayBuffer.byteLength, 'bytes for', alt);

      // Load UTIF and decode
      const UTIF = await loadUTIF();
      if (!UTIF) {
        throw new Error('UTIF library not available');
      }

      console.log('🔧 Decoding TIFF with UTIF:', alt);
      const ifds = UTIF.decode(arrayBuffer);
      
      if (ifds && ifds.length > 0) {
        UTIF.decodeImage(arrayBuffer, ifds[0]);
        const ifd = ifds[0];
        
        if (ifd.width && ifd.height && ifd.data) {
          console.log('🎨 Converting TIFF to canvas:', ifd.width + 'x' + ifd.height, 'for', alt);
          
          const canvas = document.createElement('canvas');
          canvas.width = ifd.width;
          canvas.height = ifd.height;
          const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
          
          if (ctx) {
            let processedData = new Uint8ClampedArray(ifd.data);
            
            const photometric = ifd.t262?.[0];
            const samplesPerPixel = ifd.t277?.[0] || 4;
            
            if (photometric === 5 && samplesPerPixel >= 4) {
              console.log('🎨 Converting CMYK to RGB for:', alt);
              processedData = convertCMYKtoRGB(ifd.data, ifd.width * ifd.height);
            } else if (samplesPerPixel === 3) {
              console.log('🎨 Processing RGB data for:', alt);
              processedData = addAlphaChannel(ifd.data, ifd.width * ifd.height);
            } else if (samplesPerPixel === 1) {
              console.log('🎨 Converting grayscale to RGB for:', alt);
              processedData = convertGrayscaleToRGBA(ifd.data, ifd.width * ifd.height);
            }
            
            const imageData = new ImageData(processedData, ifd.width, ifd.height);
            ctx.putImageData(imageData, 0, 0);
            
            canvas.toBlob((blob) => {
              if (blob) {
                const url = URL.createObjectURL(blob);
                console.log('✅ TIFF successfully converted to blob URL:', alt);
                setImageUrl(url);
                setLoading(false);
                onLoad?.();
              } else {
                throw new Error('Failed to create blob from canvas');
              }
            }, 'image/png', 1.0);
            return;
          }
        }
      }
      
      throw new Error('Failed to process TIFF data');
      
    } catch (err) {
      console.error('❌ Failed to load TIFF', alt, ':', err);
      setError(true);
      setLoading(false);
      onError?.();
    }
  };

  if (loading) {
    return (
      <div
        style={{
          width: '100%',
          height: 200,
          background: 'rgba(107, 114, 128, 0.2)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          ...style
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🔄</div>
          <div style={{ fontSize: 12 }}>Converting TIFF...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          width: '100%',
          height: 300,
          background: 'rgba(107, 114, 128, 0.2)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          cursor: onClick ? 'pointer' : 'default',
          transition: 'all 0.2s',
          ...style
        }}
        onClick={onClick || (() => window.open(src, '_blank'))}
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

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={alt}
        onClick={onClick}
        style={{
          width: '100%',
          height: 'auto',
          maxHeight: '400px',
          objectFit: 'contain',
          display: 'block',
          borderRadius: 8,
          cursor: onClick ? 'pointer' : 'default',
          ...style
        }}
        onError={() => {
          console.error('❌ Converted TIFF image failed to display:', alt);
          setError(true);
        }}
      />
    );
  }

  return null;
} 