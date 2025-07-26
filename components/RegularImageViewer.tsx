import React, { useState } from 'react';

interface RegularImageViewerProps {
  src: string;
  alt: string;
  onLoad?: () => void;
  onError?: () => void;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export default function RegularImageViewer({
  src,
  alt,
  onLoad,
  onError,
  style,
  onClick
}: RegularImageViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleLoad = () => {
    setLoading(false);
    setError(false);
    onLoad?.();
  };

  const handleError = () => {
    setLoading(false);
    setError(true);
    console.error('❌ Regular image failed to load:', alt, src);
    onError?.();
  };

  if (error) {
    return (
      <div
        style={{
          width: '100%',
          height: 200,
          background: 'rgba(107, 114, 128, 0.2)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          cursor: onClick ? 'pointer' : 'default',
          ...style
        }}
        onClick={onClick}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🖼️</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Image Unavailable
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

  return (
    <div style={{ position: 'relative', ...style }}>
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(107, 114, 128, 0.2)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            zIndex: 1
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔄</div>
            <div style={{ fontSize: 12 }}>Loading...</div>
          </div>
        </div>
      )}
      
      <img
        src={src}
        alt={alt}
        onLoad={handleLoad}
        onError={handleError}
        onClick={onClick}
        style={{
          width: '100%',
          height: 'auto',
          maxHeight: '400px',
          objectFit: 'contain',
          display: 'block',
          borderRadius: 8,
          cursor: onClick ? 'pointer' : 'default'
        }}
      />
    </div>
  );
} 