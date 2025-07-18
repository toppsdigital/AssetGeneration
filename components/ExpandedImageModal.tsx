import { useEffect, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import TiffImageViewer from './TiffImageViewer';

interface ExpandedImageData {
  src: string;
  alt: string;
  isTiff: boolean;
  hasCachedUrl?: boolean; // Flag to indicate if src is already a presigned URL
}

interface ExpandedImageModalProps {
  image: ExpandedImageData | null;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  currentIndex?: number;
  totalCount?: number;
  allAssets?: Array<{ filePath: string; filename: string; isTiff: boolean }>; // For prefetching
}

// Simple helper to get presigned URL for viewing images
const getPresignedUrl = async (filePath: string): Promise<string | null> => {
  try {
    console.log('🔗 Getting presigned URL for modal:', filePath);
    
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
      console.log('✅ Got presigned URL for modal:', filePath);
      return data.url;
    } else {
      throw new Error('No URL in response');
    }
    
  } catch (error) {
    console.error(`❌ Failed to get presigned URL for ${filePath}:`, error);
    return null;
  }
};

// Custom hook to cache presigned URLs with React Query
const usePresignedUrl = (filePath: string | null, hasCachedUrl: boolean = false, cachedUrl: string | null = null) => {
  return useQuery({
    queryKey: ['presigned-url', filePath],
    queryFn: () => getPresignedUrl(filePath!),
    enabled: !!filePath && !hasCachedUrl, // Only fetch if we need a URL and don't have cached one
    staleTime: 10 * 60 * 1000, // 10 minutes - presigned URLs typically last longer
    gcTime: 15 * 60 * 1000, // Keep in cache for 15 minutes  
    retry: 2,
    initialData: hasCachedUrl ? cachedUrl : undefined, // Use cached URL if available
  });
};

export default function ExpandedImageModal({
  image,
  onClose,
  onNext,
  onPrevious,
  currentIndex,
  totalCount,
  allAssets
}: ExpandedImageModalProps) {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Use React Query to cache presigned URLs
  const { 
    data: presignedUrl, 
    isLoading, 
    error: queryError 
  } = usePresignedUrl(
    image?.src || null, 
    image?.hasCachedUrl || false,
    image?.hasCachedUrl ? image.src : null
  );

  // Prefetch adjacent images for smooth navigation
  useEffect(() => {
    if (!allAssets || currentIndex === undefined || totalCount === undefined) return;

    const prefetchAdjacentUrls = () => {
      // Prefetch 2 images in each direction
      for (let offset = -2; offset <= 2; offset++) {
        const index = currentIndex + offset;
        if (index >= 0 && index < totalCount && index !== currentIndex) {
          const asset = allAssets[index];
          if (asset) {
            // Prefetch the presigned URL
            queryClient.prefetchQuery({
              queryKey: ['presigned-url', asset.filePath],
              queryFn: () => getPresignedUrl(asset.filePath),
              staleTime: 10 * 60 * 1000,
            });
          }
        }
      }
    };

    // Delay prefetching to prioritize current image
    const timeoutId = setTimeout(prefetchAdjacentUrls, 300);
    return () => clearTimeout(timeoutId);
  }, [allAssets, currentIndex, totalCount, queryClient]);

  // Handle query errors
  useEffect(() => {
    if (queryError) {
      console.error('React Query error fetching presigned URL:', queryError);
      setError('Failed to load image URL');
    } else {
      setError(null);
    }
  }, [queryError]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!image) return;
    
    switch (e.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowLeft':
        if (onPrevious) {
          e.preventDefault();
          onPrevious();
        }
        break;
      case 'ArrowRight':
        if (onNext) {
          e.preventDefault();
          onNext();
        }
        break;
    }
  }, [image, onClose, onNext, onPrevious]);

  // Add keyboard event listeners
  useEffect(() => {
    if (image) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'unset';
      };
    }
  }, [image, handleKeyDown]);

  if (!image) return null;

  const showNavigation = totalCount && totalCount > 1;
  const canGoPrevious = onPrevious && currentIndex !== undefined && currentIndex > 0;
  const canGoNext = onNext && currentIndex !== undefined && totalCount !== undefined && currentIndex < totalCount - 1;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)', // Slightly more transparent to show background
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px', // Restored padding for better spacing
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'relative',
          width: '60vw', // Further reduced from 75vw for even narrower, more focused container
          height: '90vh',
          maxWidth: '60vw',
          maxHeight: '90vh',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 25px 80px rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(20px)',
          animation: 'modalSlideIn 0.3s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with close button and counter */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 60,
          background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.4) 70%, transparent 100%)',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px'
        }}>
          {/* Image counter */}
          {showNavigation && currentIndex !== undefined && totalCount !== undefined && (
            <div style={{
              color: 'rgba(255, 255, 255, 0.9)',
              fontSize: '14px',
              fontWeight: 500,
              background: 'rgba(0, 0, 0, 0.6)',
              padding: '6px 12px',
              borderRadius: 20,
              backdropFilter: 'blur(10px)'
            }}>
              {currentIndex + 1} of {totalCount}
            </div>
          )}
          
          <div style={{ flex: 1 }} />
          
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(0, 0, 0, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '50%',
              width: 40,
              height: 40,
              color: 'white',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              backdropFilter: 'blur(10px)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(220, 38, 38, 0.8)';
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Navigation arrows */}
        {showNavigation && (
          <>
            {/* Previous button */}
            <button
              onClick={onPrevious}
              disabled={!canGoPrevious}
              style={{
                position: 'absolute',
                left: 20,
                top: '50%',
                transform: 'translateY(-50%)',
                background: canGoPrevious ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '50%',
                width: 50,
                height: 50,
                color: canGoPrevious ? 'white' : 'rgba(255, 255, 255, 0.4)',
                fontSize: '20px',
                cursor: canGoPrevious ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                zIndex: 1001,
                backdropFilter: 'blur(10px)'
              }}
              onMouseEnter={(e) => {
                if (canGoPrevious) {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.9)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (canGoPrevious) {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                }
              }}
              title="Previous image (←)"
            >
              ‹
            </button>

            {/* Next button */}
            <button
              onClick={onNext}
              disabled={!canGoNext}
              style={{
                position: 'absolute',
                right: 20,
                top: '50%',
                transform: 'translateY(-50%)',
                background: canGoNext ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '50%',
                width: 50,
                height: 50,
                color: canGoNext ? 'white' : 'rgba(255, 255, 255, 0.4)',
                fontSize: '20px',
                cursor: canGoNext ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                zIndex: 1001,
                backdropFilter: 'blur(10px)'
              }}
              onMouseEnter={(e) => {
                if (canGoNext) {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.9)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (canGoNext) {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                }
              }}
              title="Next image (→)"
            >
              ›
            </button>
          </>
        )}

        {/* Image content */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{
            width: '100%',
            height: 'calc(100% - 55px - 55px)', // Top and bottom spacing now match
            display: 'flex',
            alignItems: 'stretch', // Let image fill the space instead of center
            justifyContent: 'center',
            position: 'relative',
            marginTop: '55px', // Header clearance
            marginBottom: '55px', // Bottom spacing to match top
            paddingLeft: '12px',
            paddingRight: '12px',
            boxSizing: 'border-box',
            minHeight: '0', // Ensure it can shrink if needed
            overflow: 'hidden' // Debug: add background to see container bounds
          }}>
            {isLoading ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255, 255, 255, 0.7)',
                width: '100%',
                height: '100%'
              }}>
                <div style={{
                  width: 40,
                  height: 40,
                  border: '3px solid rgba(255, 255, 255, 0.2)',
                  borderTop: '3px solid #3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginBottom: 16
                }} />
                <div>Loading image...</div>
              </div>
            ) : error ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255, 255, 255, 0.7)',
                textAlign: 'center',
                width: '100%',
                height: '100%'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: 16 }}>🖼️</div>
                <div style={{ fontSize: '1.1rem', marginBottom: 8 }}>Image Unavailable</div>
                <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.5)' }}>
                  {error}
                </div>
              </div>
            ) : presignedUrl ? (
              <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {image.isTiff ? (
                  <TiffImageViewer
                    src={presignedUrl}
                    alt={image.alt}
                    style={{
                      height: '100%',
                      width: '100%',
                      objectFit: 'contain',
                      borderRadius: 8,
                      display: 'block'
                    }}
                    onError={() => {
                      console.warn('Failed to load expanded TIFF:', image.alt);
                      setError('Failed to load TIFF image');
                    }}
                  />
                ) : (
                  <div style={{ 
                    position: 'relative', 
                    width: '100%', 
                    height: '100%' 
                  }}>
                    <Image
                      src={presignedUrl}
                      alt={image.alt}
                      fill
                      style={{
                        objectFit: 'contain',
                        borderRadius: 8
                      }}
                      sizes="60vw" // Matches our modal width
                      priority // Load immediately for modal images
                      onError={() => {
                        console.error('❌ Expanded image failed to load:', image.alt);
                        setError('Failed to load image');
                      }}
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>
          
          {/* Fixed title area at bottom */}
          <div style={{
            position: 'absolute',
            bottom: '15px', // Centered within the 55px bottom space
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexShrink: 0,
            boxSizing: 'border-box'
          }}>
            <div style={{
              padding: '4px 8px',
              background: 'rgba(0, 0, 0, 0.6)',
              borderRadius: 4,
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              maxWidth: '55vw',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <h3 style={{
                color: '#f8f8f8',
                fontSize: '0.75rem',
                fontWeight: 600,
                margin: 0,
                textAlign: 'center',
                wordBreak: 'break-word',
                lineHeight: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {image.alt}
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* CSS animations */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes modalSlideIn {
          from { 
            opacity: 0;
            transform: scale(0.9);
          }
          to { 
            opacity: 1;
            transform: scale(1);
          }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
} 