interface JobHeaderSkeletonProps {
  className?: string;
}

export const JobHeaderSkeleton = ({ className = '' }: JobHeaderSkeletonProps) => (
  <div className={`job-header-skeleton ${className}`} style={{ 
    marginBottom: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    minHeight: 42
  }}>
    {/* Status Badge Skeleton */}
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 16px',
      borderRadius: 20,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 2s infinite',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      width: 120
    }} />
    
    {/* Metadata Skeleton */}
    <div style={{ display: 'flex', gap: 16 }}>
      {[80, 100, 120].map((width, i) => (
        <div key={i} style={{
          width,
          height: 14,
          background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 2s infinite',
          borderRadius: 4,
          animationDelay: `${i * 0.2}s`
        }} />
      ))}
    </div>
  </div>
); 