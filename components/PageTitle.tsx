import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface PageTitleProps {
  title: string | React.ReactNode;
  subtitle?: string;
  edgeToEdge?: boolean; // Controls if the component should be edge to edge
  leftButton?: 'back' | 'home' | 'none'; // Controls which button to show on the left
}

const PageTitle: React.FC<PageTitleProps> = ({ title, subtitle, edgeToEdge = false, leftButton = 'back' }) => {
  const router = useRouter();

  return (
    <div style={{
      padding: edgeToEdge ? '16px 24px 16px 24px' : '24px 24px 16px 24px',
      borderBottom: '1px solid rgba(244, 114, 182, 0.2)',
      background: 'linear-gradient(135deg, rgba(45, 27, 105, 0.05) 0%, rgba(17, 9, 43, 0.05) 100%)',
      marginBottom: edgeToEdge ? '0' : '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'relative',
      width: '100%',
      boxSizing: 'border-box',
      minHeight: '72px' // Lock in height to prevent shrinking when button is hidden
    }}>
      {/* Navigation button area - maintains width for layout stability */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: '80px' }}>
        {leftButton === 'back' && (
          <button
            onClick={() => router.back()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              color: '#e5e7eb',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            <span style={{ fontSize: '16px' }}>←</span>
            Back
          </button>
        )}
        {leftButton === 'home' && (
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              color: '#e5e7eb',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            <span style={{ fontSize: '16px' }}>🏠</span>
            Home
          </Link>
        )}
        {/* leftButton === 'none' renders nothing */}
      </div>

      {/* Centered title */}
      <div style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center'
      }}>
        <h1 style={{
          fontSize: '1.25rem',
          fontWeight: '600',
          color: '#e5e7eb',
          margin: 0,
          letterSpacing: '-0.025em',
          textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            fontSize: '0.9rem',
            color: '#9ca3af',
            margin: '4px 0 0 0',
            fontWeight: '400'
          }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Empty space on the right for balance */}
      <div style={{ minWidth: '80px' }}></div>
    </div>
  );
};

export default PageTitle; 