'use client';

import {
  defaultShouldDehydrateQuery,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { AnalyticsProvider } from '@trycompai/analytics';
import { Toaster } from '@trycompai/ui/sooner';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import SuperJSON from 'superjson';

type ProviderProps = {
  children: ReactNode;
  // Only identity for analytics: never serialize the full session (and its token) into client props.
  userId?: string;
  userEmail?: string;
};

let clientQueryClientSingleton: QueryClient | undefined = undefined;

const getQueryClient = () => {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return createQueryClient();
  } else {
    // Browser: use singleton pattern to keep the same query client
    return (clientQueryClientSingleton ??= createQueryClient());
  }
};

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
        shouldRedactErrors: () => {
          // We should not catch Next.js server errors
          // as that's how Next.js detects dynamic pages
          // so we cannot redact them.
          // Next.js also automatically redacts errors for us
          // with better digests.
          return false;
        },
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });

export function Providers({ children, userId, userEmail }: ProviderProps) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        disableTransitionOnChange
        scriptProps={{ 'data-cfasync': 'false' }}
      >
        <AnalyticsProvider userId={userId} userEmail={userEmail}>
          {children}
          <Toaster richColors />
        </AnalyticsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
