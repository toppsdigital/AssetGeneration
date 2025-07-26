import React from 'react';
import SignOutButton from './SignOutButton';
import SignInButton from './SignInButton';

interface UserSessionHeaderProps {
  session: any; // NextAuth session object (can be null)
}

const UserSessionHeader: React.FC<UserSessionHeaderProps> = ({ session }) => {
  // Get user display name
  const getUserDisplayName = () => {
    if (!session) return '';
    if (session.user?.name) return session.user.name;
    if (session.user?.email) {
      const emailName = session.user.email.split('@')[0];
      return emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }
    return 'User';
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #2d1b69 0%, #11092b 30%, #3c1053 70%, #581845 100%)',
      color: '#fce7f3',
      padding: '12px 32px',
      borderBottom: '1px solid rgba(244, 114, 182, 0.3)',
      boxShadow: '0 2px 8px rgba(157, 23, 77, 0.15)',
      fontSize: '0.9rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'relative',
      height: '64px',
      minHeight: '64px',
      boxSizing: 'border-box'
    }}>
      {/* Left side - Welcome message when authenticated, empty when not */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {session && (
          <>
            <span style={{ fontSize: '1.1rem' }}>👤</span>
            <span>Welcome, <strong>{getUserDisplayName()}</strong></span>
            {session.user?.email && (
              <span style={{ opacity: 0.7, fontSize: '0.85rem' }}>
                ({session.user.email})
              </span>
            )}
          </>
        )}
      </div>
      
      {/* Centered title */}
      <div style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center'
      }}>
        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: '700',
          color: '#fce7f3',
          margin: 0,
          letterSpacing: '-0.025em',
          textShadow: '0 2px 4px rgba(157, 23, 77, 0.3)',
          background: 'linear-gradient(135deg, #fce7f3 0%, #f3e8ff 50%, #e879f9 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          Content Production Hub
        </h1>
      </div>
      
      {/* Right side - Sign out when authenticated, Sign in text when not */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {session ? (
          <>
            <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
              Signed in via Okta
            </div>
            <SignOutButton />
          </>
        ) : (
          <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
            Sign in to Okta
          </div>
        )}
      </div>
    </div>
  );
};

export default UserSessionHeader; 