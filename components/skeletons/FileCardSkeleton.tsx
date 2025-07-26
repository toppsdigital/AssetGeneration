interface FileCardSkeletonProps {
  index?: number;
}

export const FileCardSkeleton = ({ index = 0 }: FileCardSkeletonProps) => (
  <div style={{
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 20,
    animationDelay: `${index * 0.1}s`,
    minHeight: 280,
    transition: 'all 0.3s ease'
  }}>
    {/* File Header Skeleton */}
    <div style={{ marginBottom: 20 }}>
      <div style={{
        width: '60%',
        height: 24,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 2s infinite',
        borderRadius: 6,
        marginBottom: 8
      }} />
      <div style={{
        width: '40%',
        height: 14,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 2s infinite',
        borderRadius: 4
      }} />
    </div>
    
    {/* File Sections Skeleton */}
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: 20,
      marginBottom: 24
    }}>
      {[1, 2].map((section) => (
        <div key={section}>
          {/* Section Header */}
          <div style={{
            width: '70%',
            height: 16,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 2s infinite',
            borderRadius: 4,
            marginBottom: 12
          }} />
          
          {/* Section Content */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: 8,
            padding: 12,
            height: 120
          }}>
            {[1, 2, 3].map((item) => (
              <div key={item} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8
              }}>
                <div style={{
                  width: '60%',
                  height: 13,
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s infinite',
                  borderRadius: 4
                }} />
                <div style={{
                  width: 60,
                  height: 18,
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s infinite',
                  borderRadius: 4
                }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
); 