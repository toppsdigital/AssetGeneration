'use client';

interface UploadWarningBannerProps {
  uploadedFiles: number;
  totalFiles: number;
  isVisible: boolean;
}

export const UploadWarningBanner = ({ 
  uploadedFiles, 
  totalFiles, 
  isVisible 
}: UploadWarningBannerProps) => {
  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 80, // Below the navbar
      left: 0,
      right: 0,
      background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.98), rgba(217, 119, 6, 0.98))',
      color: 'white',
      padding: '12px 24px',
      textAlign: 'center',
      fontSize: 14,
      fontWeight: 500,
      zIndex: 100,
      border: '1px solid rgba(245, 158, 11, 0.3)',
      boxShadow: '0 4px 20px rgba(245, 158, 11, 0.2)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        <span>
          Upload in progress ({uploadedFiles}/{totalFiles} files) - 
          Please don't close this tab or use the browser back button
        </span>
        <div style={{
          width: 16,
          height: 16,
          border: '2px solid rgba(255, 255, 255, 0.3)',
          borderTop: '2px solid white',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginLeft: 8
        }} />
      </div>
    </div>
  );
};
