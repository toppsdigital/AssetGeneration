import '../styles/globals.css';
import type { Metadata } from 'next';
import { auth } from './auth';
import { SignIn } from '../components/SignInButton';
import QueryProvider from '../components/QueryProvider';

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
        <body style={{ paddingBottom: '2rem' }}><SignIn/></body>
      </html>)
  }

  return (
    <html lang="en">
      <body style={{ paddingBottom: '2rem' }}>
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
} 
