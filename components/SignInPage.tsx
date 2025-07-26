import { SignIn } from './SignInButton';
import NavBar from './NavBar';

export default function SignInPage() {
  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <NavBar title="Content Production Hub" />
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          padding: '3rem',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
          textAlign: 'center',
          maxWidth: '400px',
          width: '100%'
        }}>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: '600',
            color: '#1f2937',
            marginBottom: '0.5rem'
          }}>
            Welcome Back
          </h1>
          <p style={{
            color: '#6b7280',
            marginBottom: '2rem',
            fontSize: '1rem'
          }}>
            Sign in to access your content production workspace
          </p>
          <SignIn />
        </div>
      </div>
    </div>
  );
} 