'use client';

import { useRouter } from 'next/navigation';

interface JobDetailsErrorStateProps {
  error: Error | null;
  message?: string;
}

export const JobDetailsErrorState = ({ error, message }: JobDetailsErrorStateProps) => {
  const router = useRouter();

  return (
    <div style={{
      width: '100%',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: '400px'
      }}>
        <div style={{
          color: '#fff',
          fontSize: '1.2rem',
          padding: '2rem',
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(20px)',
          borderRadius: 12,
          margin: '2rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          maxWidth: 600,
          width: '100%'
        }}>
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
    </div>
  );
};
