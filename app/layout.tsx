import '../styles/globals.css';
import type { Metadata } from 'next';
import { auth } from './auth';
import SignInPage from '../components/SignInPage';
import QueryProvider from '../components/QueryProvider';
import UserSessionHeader from '../components/UserSessionHeader';

export const metadata: Metadata = {
  title: 'Asset Generation',
  description: 'Digital Asset Generation Platform',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    return (
      <html lang="en">
        <body style={{ paddingBottom: '2rem' }}>
          <SignInPage />
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body style={{ paddingBottom: '2rem' }}>
        <QueryProvider>
          <UserSessionHeader session={session} />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
} 
