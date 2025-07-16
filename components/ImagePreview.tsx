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

// Simple helper to get presigned URL for viewing images
const getPresignedUrl = async (filePath: string): Promise<string | null> => {
  try {
    console.log('🔗 Getting presigned URL for viewing:', filePath);
    
    const response = await fetch('/api/s3-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        client_method: 'get',
        filename: filePath
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`${response.status} ${response.statusText}: ${errorText}`);
    }

    const data = await response.json();
    
    if (data.url) {
      console.log('✅ Got presigned URL for viewing:', filePath);
      return data.url;
    } else {
      throw new Error('No URL in response');
    }
    
  } catch (error) {
    console.error(`❌ Failed to get presigned URL for ${filePath}:`, error);
    return null;
  }
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
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isTiff = filePath.toLowerCase().endsWith('.tif') || filePath.toLowerCase().endsWith('.tiff');

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

  // Fetch presigned URL when visible
  useEffect(() => {
    if (!isVisible || presignedUrl) return;

    const fetchUrl = async () => {
      try {
        setError(null);
        const url = await getPresignedUrl(filePath);
        if (url) {
          setPresignedUrl(url);
        } else {
          setError('Failed to get image URL');
        }
      } catch (err) {
        console.error('Error fetching presigned URL:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    fetchUrl();
  }, [isVisible, filePath, presignedUrl]);

  // Preload URLs for priority images
  useEffect(() => {
    if (priority && filePath) {
      getPresignedUrl(filePath).then(url => {
        if (url) {
          setPresignedUrl(url);
        }
      }).catch(console.error);
    }
  }, [priority, filePath]);

  // Simulate loading progress for better UX
  useEffect(() => {
    if (isVisible && presignedUrl && !isImageLoaded) {
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
  }, [isVisible, presignedUrl, isImageLoaded]);

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
    if (!onExpand || !isImageLoaded || !presignedUrl) return;
    
    onExpand({
      src: presignedUrl,
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
      {(!presignedUrl || !isImageLoaded) && (
        <ProgressLoader progress={loadingProgress} />
      )}
      
      {presignedUrl && (
        <div
          style={{
            width: '100%',
            opacity: isImageLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease',
            position: isImageLoaded ? 'relative' : 'absolute',
            top: isImageLoaded ? 'auto' : 0,
            left: isImageLoaded ? 'auto' : 0
          }}
        >
          {isTiff ? (
            <TiffImageViewer
              src={presignedUrl}
              alt={alt}
              onLoad={handleImageLoad}
              onError={() => handleImageError('Failed to load TIFF image')}
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: 8,
                display: 'block'
              }}
            />
          ) : (
            <RegularImageViewer
              src={presignedUrl}
              alt={alt}
              onLoad={handleImageLoad}
              onError={() => handleImageError('Failed to load image')}
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: 8,
                display: 'block'
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