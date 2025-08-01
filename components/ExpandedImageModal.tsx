import { useEffect, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ImagePreview, { getCachedImageUrl, getImageUrlWithCache } from './ImagePreview';
import RegularImageViewer from './RegularImageViewer';

interface ExpandedImageData {
  src: string;
  alt: string;
  isTiff: boolean;
  hasCachedUrl?: boolean;
}

interface ExpandedImageModalProps {
  image: ExpandedImageData | null;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  currentIndex?: number;
  totalCount?: number;
  allAssets?: Array<{ filePath: string; filename: string; isTiff: boolean }>;
}

export default function ExpandedImageModal({
  image,
  onClose,
  onNext,
  onPrevious,
  currentIndex,
  totalCount,
  allAssets
}: ExpandedImageModalProps) {
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [optimizedImageUrl, setOptimizedImageUrl] = useState<string | null>(null);

  // Check for cached URL when image changes
  useEffect(() => {
    if (!image) {
      setOptimizedImageUrl(null);
      return;
    }

    // If image.src is already a blob URL (from grid conversion), use it directly
    if (image.src.startsWith('blob:')) {
      console.log('🚀 Using pre-converted blob URL for modal:', image.src);
      setOptimizedImageUrl(image.src);
      setIsImageLoading(false);
      return;
    }

    // Otherwise, check cache or fetch for file paths
    const cachedUrl = getCachedImageUrl(image.src);
    if (cachedUrl) {
      console.log('🚀 Using cached URL for modal:', image.src);
      setOptimizedImageUrl(cachedUrl);
      setIsImageLoading(false);
    } else {
      // If no cache, fetch URL but don't block modal opening
      setIsImageLoading(true);
      getImageUrlWithCache(image.src).then(url => {
        if (url) {
          console.log('📥 Got fresh URL for modal:', image.src);
          setOptimizedImageUrl(url);
          setIsImageLoading(false);
        }
      }).catch(console.error);
    }
  }, [image?.src]);

  // Auto-hide controls after 3 seconds of no mouse movement
  useEffect(() => {
    if (!image) return;
    
    let hideTimeout: NodeJS.Timeout;
    
    const showControls = () => {
      setIsControlsVisible(true);
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => setIsControlsVisible(false), 3000);
    };
    
    const handleMouseMove = () => showControls();
    
    document.addEventListener('mousemove', handleMouseMove);
    showControls(); // Show initially
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(hideTimeout);
    };
  }, [image]);

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
        background: 'rgba(0, 0, 0, 0.95)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'default',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      {/* Main image container */}
      <div
        style={{
          position: 'relative',
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 40px',
          boxSizing: 'border-box'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(0, 0, 0, 0.6)',
            border: 'none',
            borderRadius: '50%',
            width: '44px',
            height: '44px',
            color: 'white',
            fontSize: '20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            opacity: isControlsVisible ? 1 : 0,
            zIndex: 1001
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="Close (Esc)"
        >
          ✕
        </button>

        {/* Image counter */}
        {showNavigation && currentIndex !== undefined && totalCount !== undefined && (
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            color: 'white',
            fontSize: '14px',
            fontWeight: '500',
            background: 'rgba(0, 0, 0, 0.6)',
            padding: '8px 16px',
            borderRadius: '20px',
            opacity: isControlsVisible ? 1 : 0,
            transition: 'opacity 0.2s ease',
            zIndex: 1001
          }}>
            {currentIndex + 1} of {totalCount}
          </div>
        )}

        {/* Navigation arrows */}
        {showNavigation && (
          <>
            {/* Previous button */}
            {canGoPrevious && (
              <button
                onClick={onPrevious}
                style={{
                  position: 'absolute',
                  left: '20px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(0, 0, 0, 0.6)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '56px',
                  height: '56px',
                  color: 'white',
                  fontSize: '24px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  opacity: isControlsVisible ? 1 : 0,
                  zIndex: 1001
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                }}
                title="Previous image (←)"
              >
                ‹
              </button>
            )}

            {/* Next button */}
            {canGoNext && (
              <button
                onClick={onNext}
                style={{
                  position: 'absolute',
                  right: '20px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(0, 0, 0, 0.6)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '56px',
                  height: '56px',
                  color: 'white',
                  fontSize: '24px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  opacity: isControlsVisible ? 1 : 0,
                  zIndex: 1001
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                }}
                title="Next image (→)"
              >
                ›
              </button>
            )}
          </>
        )}

        {/* Main image */}
        <div style={{
          width: 'calc(100vw - 120px)',
          height: 'calc(100vh - 200px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          margin: '60px auto',
          // Add solid background for TIFF images to improve visibility
          ...(image.isTiff && {
            background: '#2d3748',
            borderRadius: '8px',
            padding: '20px'
          })
        }}>
          {optimizedImageUrl && !image.isTiff ? (
            // Use optimized URL for non-TIFF images only
            <RegularImageViewer
              src={optimizedImageUrl}
              alt={image.alt}
              onLoad={() => setIsImageLoading(false)}
              onError={() => {
                console.error('Failed to load image in modal, falling back to ImagePreview');
                setOptimizedImageUrl(null);
              }}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: '4px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)'
              }}
            />
          ) : (
            // Use ImagePreview for TIFF files and fallback cases - handles TIFF conversion properly
            <ImagePreview
              filePath={image.src}
              alt={image.alt}
              priority={true}
              lazy={false}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: '4px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
                // Override any background from ImagePreview for TIFF files in modal
                ...(image.isTiff && {
                  background: 'transparent'
                })
              }}
            />
          )}
          
          {/* Loading indicator for modal - only show for non-TIFF when using optimized URL */}
          {isImageLoading && optimizedImageUrl && !image.isTiff && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
              padding: '12px 20px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderTop: '2px solid white',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              Loading...
            </div>
          )}
        </div>

        {/* Filename at bottom */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.6)',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '20px',
          fontSize: '14px',
          fontWeight: '500',
          maxWidth: 'calc(100% - 80px)',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          opacity: isControlsVisible ? 1 : 0,
          transition: 'opacity 0.2s ease',
          zIndex: 1001
        }}>
          {image.alt}
        </div>
      </div>

      {/* CSS animations */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
} 