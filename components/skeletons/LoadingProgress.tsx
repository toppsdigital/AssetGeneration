interface LoadingProgressProps {
  step: number;
  totalSteps: number;
  message: string;
  detail?: string;
}

export const LoadingProgress = ({ 
  step, 
  totalSteps, 
  message, 
  detail 
}: LoadingProgressProps) => (
  <div style={{
    textAlign: 'center',
    padding: '48px 0',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    minHeight: 220,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    transition: 'all 0.3s ease'
  }}>
    {/* Animated Icon */}
    <div style={{
      width: 64,
      height: 64,
      margin: '0 auto 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
      borderRadius: '50%',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'conic-gradient(from 0deg, transparent, rgba(255,255,255,0.3), transparent)',
        borderRadius: '50%',
        animation: 'spin 2s linear infinite'
      }} />
      <span style={{ fontSize: 24, zIndex: 1 }}>⚡</span>
    </div>
    
    {/* Progress Bar */}
    <div style={{
      width: '60%',
      maxWidth: 300,
      height: 8,
      background: 'rgba(255,255,255,0.1)',
      borderRadius: 4,
      margin: '0 auto 16px',
      overflow: 'hidden'
    }}>
      <div style={{
        width: `${(step / totalSteps) * 100}%`,
        height: '100%',
        background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
        borderRadius: 4,
        transition: 'width 0.5s ease'
      }} />
    </div>
    
    {/* Progress Text */}
    <div style={{
      color: '#f8f8f8',
      fontSize: 18,
      fontWeight: 600,
      marginBottom: 8
    }}>
      {message}
    </div>
    
    <div style={{
      color: '#9ca3af',
      fontSize: 14,
      marginBottom: 12
    }}>
      Step {step} of {totalSteps}
    </div>
    
    {detail && (
      <div style={{
        color: '#6b7280',
        fontSize: 13,
        fontStyle: 'italic'
      }}>
        {detail}
      </div>
    )}
  </div>
); 