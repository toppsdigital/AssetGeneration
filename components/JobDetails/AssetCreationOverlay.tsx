'use client';

interface AssetCreationOverlayProps {
  isVisible: boolean;
}

export const AssetCreationOverlay = ({ isVisible }: AssetCreationOverlayProps) => {
  if (!isVisible) return null;

  return (
    <>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: '#1f2937',
          borderRadius: 16,
          padding: 48,
          textAlign: 'center',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          maxWidth: 400,
          width: '90%'
        }}>
          {/* Spinning loader */}
          <div style={{
            width: 64,
            height: 64,
            border: '4px solid rgba(16, 185, 129, 0.2)',
            borderTop: '4px solid #10b981',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 24px auto'
          }} />
          
          <h2 style={{
            color: '#f8f8f8',
            fontSize: 24,
            fontWeight: 600,
            margin: '0 0 12px 0'
          }}>
            🎨 Creating Digital Assets
          </h2>
          
          <p style={{
            color: '#9ca3af',
            fontSize: 16,
            margin: '0 0 24px 0',
            lineHeight: 1.5
          }}>
            Processing your selected colors and layers...
          </p>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: '#10b981',
            fontSize: 14
          }}>
            <div style={{
              width: 8,
              height: 8,
              backgroundColor: '#10b981',
              borderRadius: '50%',
              animation: 'pulse 1.5s ease-in-out infinite'
            }} />
            <span>This may take a few moments...</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};
