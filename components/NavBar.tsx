import React from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/NavBar.module.css';

interface NavBarProps {
  showHome?: boolean;
  showReview?: boolean;
  showBackToEdit?: boolean;
  showGenerate?: boolean;
  showViewJobs?: boolean;
  reviewDisabled?: boolean;
  onHome?: () => void;
  onReview?: () => void;
  onBackToEdit?: () => void;
  onGenerate?: () => void;
  onViewJobs?: () => void;
  title?: string | React.ReactNode;
  backLabel?: string;
  children?: React.ReactNode;
}

const NavBar: React.FC<NavBarProps> = ({
  showHome,
  showReview,
  showBackToEdit,
  showGenerate,
  showViewJobs,
  reviewDisabled,
  onHome,
  onReview,
  onBackToEdit,
  onGenerate,
  onViewJobs,
  title,
  backLabel,
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
          <button className={styles.navBtn} onClick={onBackToEdit}>
            {backLabel || 'Back to Edit'}
          </button>
        )}
      </div>
      <div className={styles.navTitle}>{title}</div>
      <div className={styles.navRight}>
        {showReview && (
          <button 
            className={styles.generateBtn} 
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
        {showViewJobs && (
          <button className={styles.generateBtn} onClick={onViewJobs}>View Jobs</button>
        )}
        {children}
      </div>
    </nav>
  );
};

export default NavBar; 