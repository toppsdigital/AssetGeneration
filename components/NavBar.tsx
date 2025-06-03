import React from 'react';
import { useRouter } from 'next/router';
import styles from '../styles/NavBar.module.css';

interface NavBarProps {
  showHome?: boolean;
  showReview?: boolean;
  showBackToEdit?: boolean;
  showGenerate?: boolean;
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
          <button className={styles.navBtn} onClick={onReview}>Review</button>
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