import { useEffect, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ImagePreview from './ImagePreview';

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
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

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
        background: 'rgba(0, 0, 0, 0.85)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'relative',
          width: '60vw',
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
            height: 'calc(100% - 55px - 55px)',
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'center',
            position: 'relative',
            marginTop: '55px',
            marginBottom: '55px',
            paddingLeft: '12px',
            paddingRight: '12px',
            boxSizing: 'border-box',
            minHeight: '0',
            overflow: 'hidden'
          }}>
            <ImagePreview
              filePath={image.src}
              alt={image.alt}
              priority={true}
              lazy={false}
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            />
          </div>
          
          {/* Fixed title area at bottom */}
          <div style={{
            position: 'absolute',
            bottom: '15px',
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