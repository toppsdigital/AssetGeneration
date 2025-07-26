interface JobStatusBadgeProps {
  status: string;
  totalPdfFiles?: number;
  uploadedPdfFiles?: number;
  className?: string;
}

const getStatusColor = (status: string) => {
  const lowerStatus = status.toLowerCase();
  if (lowerStatus.includes('succeed') || lowerStatus.includes('completed')) return '#10b981';
  if (lowerStatus.includes('fail') || lowerStatus.includes('error')) return '#ef4444';
  if (lowerStatus.includes('progress') || lowerStatus.includes('running') || lowerStatus.includes('processing') || lowerStatus.includes('started')) return '#f59e0b';
  return '#3b82f6';
};

const capitalizeStatus = (status: string) => {
  if (!status) return '';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const isStatusActive = (status: string) => {
  const lowerStatus = status.toLowerCase();
  return lowerStatus.includes('uploading') || 
         lowerStatus.includes('extracting') || 
         lowerStatus.includes('generating');
};

export const JobStatusBadge = ({ 
  status, 
  totalPdfFiles = 0, 
  uploadedPdfFiles = 0, 
  className = '' 
}: JobStatusBadgeProps) => {
  return (
    <div 
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderRadius: 20,
        background: getStatusColor(status),
        boxShadow: `0 2px 8px ${getStatusColor(status)}30`,
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}
    >
      {/* Loading spinner for active statuses */}
      {isStatusActive(status) && (
        <div style={{
          width: 14,
          height: 14,
          border: '2px solid rgba(255, 255, 255, 0.3)',
          borderTop: '2px solid white',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
      )}
      <span style={{ 
        color: 'white', 
        fontSize: 14, 
        fontWeight: 600,
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)'
      }}>
        {capitalizeStatus(status)}
        {/* Show upload progress when status is uploading */}
        {status?.toLowerCase() === 'uploading' && totalPdfFiles > 0 && (
          <span style={{ 
            fontSize: 12, 
            fontWeight: 500,
            marginLeft: 4,
            opacity: 0.9
          }}>
            ({uploadedPdfFiles}/{totalPdfFiles} files)
          </span>
        )}
      </span>
    </div>
  );
}; 