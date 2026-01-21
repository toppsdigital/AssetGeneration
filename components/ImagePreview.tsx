'use client';

import { useState, useEffect, useRef } from 'react';
import RegularImageViewer from './RegularImageViewer';
import TiffImageViewer from './TiffImageViewer';

interface ImagePreviewProps {
  filePath: string;
  alt: string;
  onExpand?: (imageData: { src: string; alt: string; isTiff: boolean }) => void;
  lazy?: boolean;
  priority?: boolean; // For preloading important images
  style?: React.CSSProperties;
}

// Skeleton loader component
const SkeletonLoader = ({ aspectRatio = '2.5/3.5' }: { aspectRatio?: string }) => (
  <div
    style={{
      width: '100%',
      aspectRatio,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 2s infinite',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden'
    }}
  >
    {/* Shimmer effect */}
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: '-100%',
        width: '100%',
        height: '100%',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
        animation: 'shimmerMove 2s infinite'
      }}
    />
    <div style={{
      color: 'rgba(255,255,255,0.3)',
      fontSize: '2rem',
      zIndex: 1
    }}>
      📷
    </div>
    <style jsx>{`
      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      @keyframes shimmerMove {
        0% { left: -100%; }
        100% { left: 100%; }
      }
    `}</style>
  </div>
);

// Progress loader for when we have URL but image is loading
const ProgressLoader = ({ progress = 0 }: { progress?: number }) => (
  <div
    style={{
      width: '100%',
      aspectRatio: '2.5/3.5',
      background: 'rgba(255,255,255,0.05)',
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden'
    }}
  >
    <div style={{
      color: 'rgba(255,255,255,0.7)',
      fontSize: '2rem',
      marginBottom: 16
    }}>
      🎨
    </div>
    
    {/* Progress bar */}
    <div style={{
      width: '60%',
      height: 4,
      background: 'rgba(255,255,255,0.1)',
      borderRadius: 2,
      overflow: 'hidden'
    }}>
      <div
        style={{
          width: `${progress}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #3b82f6, #06d6a0)',
          borderRadius: 2,
          transition: 'width 0.3s ease'
        }}
      />
    </div>
    
    <div style={{
      color: 'rgba(255,255,255,0.5)',
      fontSize: '0.75rem',
      marginTop: 8
    }}>
      Loading image...
    </div>
  </div>
);

// Simple helper to get image content via content pipeline and create a blob URL
const getImageUrl = async (filePath: string): Promise<string | null> => {
  try {
    console.log('🔗 Getting image via content pipeline for:', filePath);
    
    const response = await fetch('/api/content-pipeline-proxy?operation=s3_download_file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        key: filePath
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`${response.status} ${response.statusText}: ${errorText}`);
    }

    const data = await response.json();
    console.log('📥 Content pipeline response:', data);
    
    // Check if we have a pre-signed URL in the response
    if (data.success && data.data?.download_url) {
      console.log('✅ Got pre-signed URL from content pipeline for:', filePath);
      return data.data.download_url;
    } 
    // Fallback: check if we have base64 file content (alternative API response format)
    else if (data.file_content) {
      console.log('📦 Converting base64 content to blob URL for:', filePath);
      
      try {
        // Detect content type from file extension
        const extension = filePath.toLowerCase().split('.').pop();
        let contentType = 'image/jpeg'; // default
        
        switch (extension) {
          case 'pdf':
            contentType = 'application/pdf';
            break;
          case 'png':
            contentType = 'image/png';
            break;
          case 'gif':
            contentType = 'image/gif';
            break;
          case 'webp':
            contentType = 'image/webp';
            break;
          case 'tif':
          case 'tiff':
            contentType = 'image/tiff';
            break;
          case 'jpg':
          case 'jpeg':
            contentType = 'image/jpeg';
            break;
        }
        
        // Convert base64 to blob
        const binaryString = atob(data.file_content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        const blob = new Blob([bytes], { type: contentType });
        const blobUrl = URL.createObjectURL(blob);
        
        console.log('✅ Created blob URL for:', filePath);
        return blobUrl;
      } catch (blobError) {
        console.error('❌ Failed to create blob URL:', blobError);
        throw new Error('Failed to process image data');
      }
    } else {
      console.error('❌ Unexpected response format:', data);
      throw new Error('No download URL or file content in response');
    }
    
  } catch (error) {
    console.error(`❌ Failed to get image via content pipeline for ${filePath}:`, error);
    return null;
  }
};

// Global URL cache - shared across all ImagePreview instances
const globalUrlCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Helper to get cached URL if still valid
const getCachedUrl = (filePath: string): string | null => {
  const cached = globalUrlCache.get(filePath);
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
    console.log('🎯 Using cached URL for:', filePath);
    return cached.url;
  }
  if (cached) {
    // Cleanup expired cache entry
    if (cached.url.startsWith('blob:')) {
      URL.revokeObjectURL(cached.url);
    }
    globalUrlCache.delete(filePath);
  }
  return null;
};

// Helper to cache URL
const setCachedUrl = (filePath: string, url: string): void => {
  // Clean up old URL if it was a blob
  const existing = globalUrlCache.get(filePath);
  if (existing && existing.url.startsWith('blob:')) {
    URL.revokeObjectURL(existing.url);
  }
  
  globalUrlCache.set(filePath, { url, timestamp: Date.now() });
  console.log('💾 Cached URL for:', filePath);
};

// Export function to get URL with cache (for use in modal)
export const getImageUrlWithCache = async (filePath: string): Promise<string | null> => {
  // Check cache first
  const cachedUrl = getCachedUrl(filePath);
  if (cachedUrl) {
    return cachedUrl;
  }
  
  // Fetch new URL
  const url = await getImageUrl(filePath);
  if (url) {
    setCachedUrl(filePath, url);
  }
  return url;
};

// Export function to get cached URL without fetching (for immediate use)
export const getCachedImageUrl = (filePath: string): string | null => {
  return getCachedUrl(filePath);
};

export default function ImagePreview({
  filePath,
  alt,
  onExpand,
  lazy = true,
  priority = false,
  style
}: ImagePreviewProps) {
  const [isVisible, setIsVisible] = useState(!lazy || priority);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isTiff = filePath.toLowerCase().endsWith('.tif') || filePath.toLowerCase().endsWith('.tiff');
  const isPdf = filePath.toLowerCase().endsWith('.pdf');

  // Cleanup blob URL when component unmounts or filePath changes
  useEffect(() => {
    return () => {
      if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  // Cleanup old blob URL when filePath changes  
  useEffect(() => {
    if (imageUrl && imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imageUrl);
    }
    // Reset state when filePath changes
    setImageUrl(null);
    setIsImageLoaded(false);
    setError(null);
    setLoadingProgress(0);
  }, [filePath]);

  // Optimized intersection observer with earlier threshold
  useEffect(() => {
    if (!lazy || priority) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        // Load images when they're 200px away from viewport
        rootMargin: '200px',
        threshold: 0.01
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [lazy, priority]);

  // Fetch presigned URL when visible (with global cache)
  useEffect(() => {
    if (!isVisible || imageUrl) return;

    const fetchUrl = async () => {
      try {
        setError(null);
        
        // Check cache first
        const cachedUrl = getCachedUrl(filePath);
        if (cachedUrl) {
          setImageUrl(cachedUrl);
          return;
        }
        
        // Fetch new URL
        const url = await getImageUrl(filePath);
        if (url) {
          setCachedUrl(filePath, url);
          setImageUrl(url);
        } else {
          setError('Failed to get image URL');
        }
      } catch (err) {
        console.error('Error fetching presigned URL:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    fetchUrl();
  }, [isVisible, filePath, imageUrl]);

  // Preload URLs for priority images (with global cache)
  useEffect(() => {
    if (priority && filePath) {
      // Check cache first
      const cachedUrl = getCachedUrl(filePath);
      if (cachedUrl) {
        setImageUrl(cachedUrl);
        return;
      }
      
      // Fetch and cache new URL
      getImageUrl(filePath).then(url => {
        if (url) {
          setCachedUrl(filePath, url);
          setImageUrl(url);
        }
      }).catch(console.error);
    }
  }, [priority, filePath]);

  // Simulate loading progress for better UX
  useEffect(() => {
    if (isVisible && imageUrl && !isImageLoaded) {
      const interval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90; // Stay at 90% until actual load
          }
          return prev + Math.random() * 15;
        });
      }, 200);

      return () => clearInterval(interval);
    }
  }, [isVisible, imageUrl, isImageLoaded]);

  const handleImageLoad = () => {
    setIsImageLoaded(true);
    setLoadingProgress(100);
    setError(null);
  };

  const handleImageError = (error: Error | string) => {
    console.error('Image load error:', error);
    setError(typeof error === 'string' ? error : error.message);
    setIsImageLoaded(false);
  };

  const handleImageClick = () => {
    if (!onExpand || !isImageLoaded || !imageUrl) return;
    
    onExpand({
      src: imageUrl,
      alt,
      isTiff
    });
  };

  if (error) {
    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          aspectRatio: '2.5/3.5',
          background: 'rgba(255,0,0,0.1)',
          border: '1px solid rgba(255,0,0,0.3)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          ...style
        }}
      >
        <div style={{ color: 'rgba(255,100,100,0.8)', fontSize: '1.5rem', marginBottom: 8 }}>
          ❌
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', textAlign: 'center', padding: '0 8px' }}>
          Failed to load
        </div>
      </div>
    );
  }

  if (!isVisible) {
    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          aspectRatio: '2.5/3.5',
          ...style
        }}
      >
        <SkeletonLoader />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        position: 'relative',
        cursor: isImageLoaded && onExpand ? 'pointer' : 'default',
        ...style
      }}
      onClick={handleImageClick}
    >
      {(!imageUrl || !isImageLoaded) && (
        <ProgressLoader progress={loadingProgress} />
      )}
      
      {imageUrl && (
        <div
          style={{
            width: '100%',
            height: '100%',
            opacity: isImageLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease',
            position: isImageLoaded ? 'relative' : 'absolute',
            top: isImageLoaded ? 'auto' : 0,
            left: isImageLoaded ? 'auto' : 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            // Add background for TIFF images in expanded state only  
            ...(isTiff && style?.height && {
              background: '#2d3748',
              borderRadius: '8px'
            })
          }}
        >
          {isPdf ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 4,
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)'
              }}
            >
              {/* Use browser-native PDF renderer */}
              <iframe
                // In the grid we want a "thumbnail-ish" first page; in the modal we want full viewer controls.
                src={
                  onExpand
                    ? `${imageUrl}#page=1&zoom=page-fit&toolbar=0&navpanes=0`
                    : imageUrl
                }
                title={alt}
                onLoad={handleImageLoad}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  // In grids we want the parent card click to work; in modals (no onExpand) allow interaction/scrolling.
                  pointerEvents: onExpand ? 'none' : 'auto',
                  background: 'rgba(0,0,0,0.25)',
                  display: 'block'
                }}
              />

              {/* Small "PDF" badge */}
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  background: 'rgba(0,0,0,0.6)',
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 8px',
                  borderRadius: 999,
                  letterSpacing: 0.5,
                  pointerEvents: 'none'
                }}
              >
                PDF
              </div>
            </div>
          ) : isTiff ? (
            <TiffImageViewer
              src={imageUrl}
              alt={alt}
              onLoad={handleImageLoad}
              onError={() => handleImageError('Failed to load TIFF image')}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                borderRadius: 4,
                display: 'block',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)'
              }}
            />
          ) : (
            <RegularImageViewer
              src={imageUrl}
              alt={alt}
              onLoad={handleImageLoad}
              onError={() => handleImageError('Failed to load image')}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                borderRadius: 4,
                display: 'block',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)'
              }}
            />
          )}
        </div>
      )}

      {/* Hover overlay when loaded */}
      {isImageLoaded && onExpand && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0,
            transition: 'opacity 0.2s ease',
            borderRadius: 8,
            pointerEvents: 'none'
          }}
          className="hover-overlay"
        >
          <div style={{
            background: 'rgba(255,255,255,0.9)',
            color: '#333',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: '0.8rem',
            fontWeight: 600
          }}>
            Click to expand
          </div>
        </div>
      )}

      <style jsx>{`
        div:hover .hover-overlay {
          opacity: 1;
        }
      `}</style>
    </div>
  );
} 