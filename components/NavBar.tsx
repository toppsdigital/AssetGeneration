'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../styles/NavBar.module.css';

interface NavBarProps {
  showHome?: boolean;
  showReview?: boolean;
  showBackToEdit?: boolean;
  showBackToJobs?: boolean;
  showGenerate?: boolean;
  showViewJobs?: boolean;
  reviewDisabled?: boolean;
  onHome?: () => void;
  onReview?: () => void;
  onBackToEdit?: () => void;
  onBackToJobs?: () => void;
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
  showBackToJobs,
  showGenerate,
  showViewJobs,
  reviewDisabled,
  onHome,
  onReview,
  onBackToEdit,
  onBackToJobs,
  onGenerate,
  onViewJobs,
  title,
  backLabel,
  children,
}) => {
  const router = useRouter();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSignOut = async () => {
    try {
      // Call the auth endpoint to sign out
      await fetch('/auth/signout', { method: 'POST' });
      // Redirect to home page
      window.location.href = '/';
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // For now, let's use a simple user indicator - we'll improve this when we test
  const mockUser = { name: 'Test User' }; // This would come from session context

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
        {showBackToJobs && (
          <button className={styles.navBtn} onClick={onBackToJobs}>
            ← Back to Jobs
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
        {mockUser && (
          <div className={styles.userProfile} ref={dropdownRef}>
            <button 
              className={styles.userProfileBtn} 
              onClick={() => setShowDropdown(!showDropdown)}
            >
              {mockUser.name || 'User'}
            </button>
            {showDropdown && (
              <div className={styles.userDropdown}>
                <button onClick={handleSignOut} className={styles.signOutBtn}>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default NavBar; 