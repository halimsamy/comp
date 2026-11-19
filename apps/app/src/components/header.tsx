import { UserMenu } from '@/components/user-menu';
import { Skeleton } from '@trycompai/ui/skeleton';
import { Suspense } from 'react';
import { AssistantButton } from './ai/chat-button';
import { NotificationBell } from './notifications/notification-bell';

/** Minimal header for pages outside the app shell (e.g. /no-access): no navigation. */
export function Header({
  organizationId,
  hideChat = false,
}: {
  organizationId?: string;
  hideChat?: boolean;
}) {
  return (
    <header className="border/40 sticky top-0 z-10 flex items-center justify-between border-b px-4 py-2 backdrop-blur-sm bg-card">
      {!hideChat && <AssistantButton />}

      <div className="ml-auto mr-2 flex items-center">
        <NotificationBell />
      </div>
      <div className="flex items-center space-x-2">
        <Suspense fallback={<Skeleton className="h-8 w-8 rounded-full" />}>
          <UserMenu orgId={organizationId} />
        </Suspense>
      </div>
    </header>
  );
}
