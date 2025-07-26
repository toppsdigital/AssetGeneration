'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Cache data for 5 minutes
        gcTime: 5 * 60 * 1000,
        // Consider data fresh for 1 minute to reduce unnecessary refetches
        staleTime: 60 * 1000,
        // Retry failed requests 2 times (reduced from 3)
        retry: 2,
        // Reduce aggressive refetching
        refetchOnWindowFocus: false,
        // Only refetch if data is stale
        refetchOnMount: 'always',
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Only show devtools in development and make it less intrusive */}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools 
          initialIsOpen={false}
        />
      )}
    </QueryClientProvider>
  );
} 