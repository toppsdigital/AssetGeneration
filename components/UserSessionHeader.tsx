import React from 'react';
import SignOutButton from './SignOutButton';

interface UserSessionHeaderProps {
  session: any; // NextAuth session object
}

const UserSessionHeader: React.FC<UserSessionHeaderProps> = ({ session }) => {
  // Get user display name
  const getUserDisplayName = () => {
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
      justifyContent: 'space-between'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '1.1rem' }}>👤</span>
        <span>Welcome back, <strong>{getUserDisplayName()}</strong></span>
        {session.user?.email && (
          <span style={{ opacity: 0.7, fontSize: '0.85rem' }}>
            ({session.user.email})
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
          Signed in via Okta
        </div>
        <SignOutButton />
      </div>
    </div>
  );
};

export default UserSessionHeader; 