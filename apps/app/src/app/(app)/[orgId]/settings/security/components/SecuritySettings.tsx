'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { useSecuritySettings } from '@/hooks/use-security-settings';
import { Alert, AlertDescription, Skeleton, Stack, Text } from '@trycompai/design-system';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { IdleTimeoutCard } from './IdleTimeoutCard';
import { SignInMethodsCard } from './SignInMethodsCard';

export function SecuritySettings() {
  const { orgId } = useParams<{ orgId: string }>();
  const { hasPermission } = usePermissions();
  const { settings, error, isLoading, update } = useSecuritySettings();
  const canEdit = hasPermission('organization', 'update');

  if (isLoading && !settings) {
    return (
      <Stack gap="4">
        <Skeleton style={{ height: '10rem', width: '100%' }} />
        <Skeleton style={{ height: '14rem', width: '100%' }} />
      </Stack>
    );
  }

  if (error || !settings) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Security settings couldn&apos;t be loaded. Refresh the page to try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Stack gap="4">
      <IdleTimeoutCard settings={settings} canEdit={canEdit} onUpdate={update} />
      <SignInMethodsCard settings={settings} canEdit={canEdit} onUpdate={update} />
      <Text size="sm" variant="muted">
        Every change is recorded in the{' '}
        <Link href={`/${orgId}/settings/event-log`} className="underline">
          event log
        </Link>
        , with sign-ins, sign-outs and idle timeouts.
      </Text>
    </Stack>
  );
}
