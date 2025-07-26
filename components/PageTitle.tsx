import React from 'react';
import Link from 'next/link';

interface PageTitleProps {
  title: string | React.ReactNode;
  subtitle?: string;
}

const PageTitle: React.FC<PageTitleProps> = ({ title, subtitle }) => {
  return (
    <div style={{
      padding: '24px 24px 16px 24px',
      borderBottom: '1px solid rgba(244, 114, 182, 0.2)',
      background: 'linear-gradient(135deg, rgba(45, 27, 105, 0.05) 0%, rgba(17, 9, 43, 0.05) 100%)',
      marginBottom: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'relative',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Navigation buttons on the left */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '6px',
            color: '#e5e7eb',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
        >
          <span style={{ fontSize: '16px' }}>🏠</span>
          Home
        </Link>
        
        <Link
          href="/jobs"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '6px',
            color: '#e5e7eb',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
        >
          Jobs
        </Link>
      </div>

      {/* Centered title */}
      <div style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center'
      }}>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: '600',
          color: '#fce7f3',
          margin: 0,
          letterSpacing: '-0.025em',
          textShadow: '0 2px 4px rgba(157, 23, 77, 0.3)'
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            fontSize: '1rem',
            color: 'rgba(252, 231, 243, 0.7)',
            margin: '8px 0 0 0',
            fontWeight: '400'
          }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Empty space on the right for balance */}
      <div style={{ width: '160px' }}></div>
    </div>
  );
};

export default PageTitle; 