import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/services/auth/AuthProvider';
import { ApiError } from '@/services/api/errors';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Réessayer une erreur 4xx est inutile : la requête est mauvaise,
      // pas le réseau.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && !error.isRetryable) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

export function Providers({ children }: { children: ReactNode }): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
