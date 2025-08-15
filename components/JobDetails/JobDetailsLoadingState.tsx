'use client';

import { JobHeaderSkeleton, LoadingProgress, FileCardSkeleton } from '../';
import styles from '../../styles/Edit.module.css';

interface JobDetailsLoadingStateProps {
  loadingStep: number;
  totalSteps: number;
  loadingMessage: string;
  loadingDetail?: string;
}

export const JobDetailsLoadingState = ({
  loadingStep,
  totalSteps,
  loadingMessage,
  loadingDetail
}: JobDetailsLoadingStateProps) => {
  return (
    <div className={styles.pageContainer}>
      <div className={styles.editContainer}>
        <main className={styles.mainContent}>
          <div style={{
            maxWidth: 1200,
            width: '100%',
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 16,
            padding: 32,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            {/* Job Header Skeleton */}
            <JobHeaderSkeleton />
            
            {/* Loading Progress */}
            <LoadingProgress
              step={loadingStep}
              totalSteps={totalSteps}
              message={loadingMessage}
              detail={loadingDetail}
            />
            
            {/* Files Section Skeleton */}
            <div style={{ marginTop: 32 }}>
              <div style={{
                width: '200px',
                height: 32,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 2s infinite',
                borderRadius: 8,
                marginBottom: 24
              }} />
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {[0, 1].map((index) => (
                  <FileCardSkeleton key={index} index={index} />
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
