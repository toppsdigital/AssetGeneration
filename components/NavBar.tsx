import React from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/NavBar.module.css';

interface NavBarProps {
  showHome?: boolean;
  showReview?: boolean;
  showBackToEdit?: boolean;
  showGenerate?: boolean;
  reviewDisabled?: boolean;
  onHome?: () => void;
  onReview?: () => void;
  onBackToEdit?: () => void;
  onGenerate?: () => void;
  title?: string | React.ReactNode;
  children?: React.ReactNode;
}

const NavBar: React.FC<NavBarProps> = ({
  showHome,
  showReview,
  showBackToEdit,
  showGenerate,
  reviewDisabled,
  onHome,
  onReview,
  onBackToEdit,
  onGenerate,
  title,
  children,
}) => {
  const router = useRouter();
  return (
    <nav className={styles.navBar}>
      <div className={styles.navLeft}>
        {showHome && (
          <button
            className={styles.homeIconBtn}
            onClick={onHome || (() => router.push('/'))}
            aria-label="Home"
          >
            🏠
          </button>
        )}
        {showBackToEdit && (
          <button className={styles.navBtn} onClick={onBackToEdit}>Back to Edit</button>
        )}
      </div>
      <div className={styles.navTitle}>{title}</div>
      <div className={styles.navRight}>
        {showReview && (
          <button 
            className={styles.navBtn} 
            onClick={onReview}
            disabled={reviewDisabled}
            style={{ 
              opacity: reviewDisabled ? 0.5 : 1, 
              cursor: reviewDisabled ? 'not-allowed' : 'pointer' 
            }}
          >
            Review
          </button>
        )}
        {showGenerate && (
          <button className={styles.generateBtn} onClick={onGenerate}>Generate</button>
        )}
        {children}
      </div>
    </nav>
  );
};

export default NavBar; 