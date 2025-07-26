'use client';

import React from 'react';

const SignOutButton = () => {
  const handleSignOut = async () => {
    try {
      // Simple redirect to sign out endpoint
      window.location.href = '/auth/signout';
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <button
      onClick={handleSignOut}
      style={{
        background: 'rgba(244, 114, 182, 0.15)',
        color: '#fce7f3',
        border: '1px solid rgba(244, 114, 182, 0.25)',
        borderRadius: '6px',
        padding: '6px 12px',
        fontSize: '0.8rem',
        cursor: 'pointer',
        transition: 'all 0.2s',
        fontWeight: '500'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(244, 114, 182, 0.25)';
        e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.5)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(244, 114, 182, 0.15)';
        e.currentTarget.style.borderColor = 'rgba(244, 114, 182, 0.25)';
      }}
    >
      Sign Out
    </button>
  );
};

export default SignOutButton; 