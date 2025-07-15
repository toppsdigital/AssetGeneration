import '../styles/globals.css';
import type { Metadata } from 'next';
import { auth } from './auth';
import { SignIn } from '../components/SignInButton';

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
        <body><SignIn/></body>
      </html>)
  }

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
} 
