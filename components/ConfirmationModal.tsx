'use client';

import React from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmButtonStyle?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmButtonStyle = 'primary',
  isLoading = false
}) => {
  if (!isOpen) return null;

  const getConfirmButtonStyles = () => {
    const baseStyles = {
      padding: '12px 24px',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      cursor: isLoading ? 'not-allowed' : 'pointer',
      transition: 'all 0.2s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      opacity: isLoading ? 0.7 : 1
    };

    switch (confirmButtonStyle) {
      case 'danger':
        return {
          ...baseStyles,
          background: isLoading ? 'rgba(239, 68, 68, 0.5)' : 'linear-gradient(135deg, #ef4444, #dc2626)',
          color: 'white',
          boxShadow: isLoading ? 'none' : '0 4px 12px rgba(239, 68, 68, 0.3)'
        };
      case 'warning':
        return {
          ...baseStyles,
          background: isLoading ? 'rgba(245, 158, 11, 0.5)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: 'white',
          boxShadow: isLoading ? 'none' : '0 4px 12px rgba(245, 158, 11, 0.3)'
        };
      default:
        return {
          ...baseStyles,
          background: isLoading ? 'rgba(168, 85, 247, 0.5)' : 'linear-gradient(135deg, #a855f7, #9333ea)',
          color: 'white',
          boxShadow: isLoading ? 'none' : '0 4px 12px rgba(168, 85, 247, 0.3)'
        };
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(4px)'
      }}
      onClick={handleBackdropClick}
    >
      <div style={{
        backgroundColor: '#1f2937',
        borderRadius: 16,
        padding: 32,
        maxWidth: 480,
        width: '90%',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        position: 'relative'
      }}>
        {/* Header */}
        <div style={{
          marginBottom: 20,
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: 48,
            marginBottom: 16
          }}>
            {confirmButtonStyle === 'danger' ? '⚠️' : confirmButtonStyle === 'warning' ? '🔄' : '⚠️'}
          </div>
          <h2 style={{
            fontSize: 24,
            fontWeight: 700,
            color: '#f8f8f8',
            margin: '0 0 12px 0'
          }}>
            {title}
          </h2>
          <p style={{
            fontSize: 16,
            color: '#d1d5db',
            margin: 0,
            lineHeight: 1.5
          }}>
            {message}
          </p>
        </div>

        {/* Buttons */}
        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'center'
        }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '12px 24px',
              background: 'rgba(107, 114, 128, 0.2)',
              border: '1px solid rgba(107, 114, 128, 0.3)',
              borderRadius: 8,
              color: '#d1d5db',
              fontSize: 14,
              fontWeight: 500,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: isLoading ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.background = 'rgba(107, 114, 128, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading) {
                e.currentTarget.style.background = 'rgba(107, 114, 128, 0.2)';
              }
            }}
          >
            {cancelText}
          </button>

          <button
            onClick={onConfirm}
            disabled={isLoading}
            style={getConfirmButtonStyles()}
          >
            {isLoading ? (
              <>
                <div style={{
                  width: 16,
                  height: 16,
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                Processing...
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>

        {/* Add required CSS animations */}
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}; 