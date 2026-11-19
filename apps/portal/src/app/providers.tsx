'use client';

import { AnalyticsProvider } from '@trycompai/analytics';
import type { ReactNode } from 'react';

// Only identity for analytics: the full session (incl. its token) must never be
// serialized into client props.
type ProviderProps = {
  children: ReactNode;
  userId?: string;
  userEmail?: string;
};

export function Providers({ children, userId, userEmail }: ProviderProps) {
  return (
    <AnalyticsProvider userId={userId} userEmail={userEmail}>
      {children}
    </AnalyticsProvider>
  );
}
