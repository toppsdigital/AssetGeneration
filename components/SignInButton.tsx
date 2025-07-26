'use client';

import React from 'react';
import styles from '../styles/Home.module.css';

const SignInButton = () => {
  const handleSignIn = () => {
    window.location.href = '/auth/signin';
  };

  return (
    <button 
      onClick={handleSignIn}
      type="button"
      className={styles.primaryButton}
      style={{
        fontSize: '1.4rem',
        padding: '1.5rem 3rem',
        minWidth: '280px',
        height: '70px',
        fontWeight: '700'
      }}
    >
      <span className={styles.buttonIcon} style={{ fontSize: '1.6rem' }}>🔐</span>
      Sign in with Okta
    </button>
  );
};

export default SignInButton;
