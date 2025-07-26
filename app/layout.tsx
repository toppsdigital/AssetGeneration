import '../styles/globals.css';
import type { Metadata } from 'next';
import QueryProvider from '../components/QueryProvider';

export const metadata: Metadata = {
  title: 'Asset Generation',
  description: 'Digital Asset Generation Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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