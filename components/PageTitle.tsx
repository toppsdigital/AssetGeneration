import React from 'react';

interface PageTitleProps {
  title: string | React.ReactNode;
  subtitle?: string;
}

const PageTitle: React.FC<PageTitleProps> = ({ title, subtitle }) => {
  return (
    <div style={{
      padding: '24px 32px 16px 32px',
      borderBottom: '1px solid rgba(244, 114, 182, 0.2)',
      background: 'linear-gradient(135deg, rgba(45, 27, 105, 0.05) 0%, rgba(17, 9, 43, 0.05) 100%)',
      marginBottom: '16px'
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
  );
};

export default PageTitle; 