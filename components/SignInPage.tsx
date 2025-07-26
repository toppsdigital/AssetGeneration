'use client';

import SignInButton from './SignInButton';
import styles from '../styles/Home.module.css';

export default function SignInPage() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.mainSections}>
          {/* Welcome Section */}
          <div className={styles.prominentSection} style={{ 
            textAlign: 'center',
            padding: '4rem 3rem',
            maxWidth: '600px',
            margin: '3rem auto'
          }}>
            <div className={styles.sectionHeader}>
              <h2 style={{ fontSize: '2.5rem', marginBottom: '1.5rem' }}>Welcome Back</h2>
              <p style={{ fontSize: '1.2rem', marginBottom: '3rem' }}>
                Sign in to access your content production workspace and start creating amazing digital assets.
              </p>
            </div>
            <div className={styles.buttonGroup} style={{ marginTop: '2rem' }}>
              <SignInButton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 