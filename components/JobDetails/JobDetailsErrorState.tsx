'use client';

import { useRouter } from 'next/navigation';
import styles from '../../styles/Edit.module.css';

interface JobDetailsErrorStateProps {
  error: Error | null;
  message?: string;
}

export const JobDetailsErrorState = ({ error, message }: JobDetailsErrorStateProps) => {
  const router = useRouter();

  return (
    <div className={styles.pageContainer}>
      <div className={styles.loading}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
        <h2>Error Loading Job Details</h2>
        <p>{message || error?.message || 'Unknown error occurred'}</p>
        <button 
          onClick={() => router.push('/jobs')}
          style={{
            marginTop: 16,
            padding: '8px 16px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer'
          }}
        >
          Back to Jobs
        </button>
      </div>
    </div>
  );
};
