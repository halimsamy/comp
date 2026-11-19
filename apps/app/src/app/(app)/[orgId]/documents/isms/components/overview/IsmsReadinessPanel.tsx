'use client';

import { Badge, Button, Progress, Stack, Text } from '@trycompai/design-system';
import { ArrowRight, Renew } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import type { IsmsReadiness } from '../../hooks/useIsmsReadiness';

interface IsmsReadinessPanelProps {
  organizationId: string;
  readiness: IsmsReadiness | undefined;
  isLoading: boolean;
  error: unknown;
  canRefresh: boolean;
  onRefresh: () => Promise<void>;
}

/**
 * Guided header for the ISMS overview: overall clause 4–10 progress, one-click
 * refresh of every draft from platform data, and the 10.2 nonconformity
 * register entry point.
 */
export function IsmsReadinessPanel({
  organizationId,
  readiness,
  isLoading,
  error,
  canRefresh,
  onRefresh,
}: IsmsReadinessPanelProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
      toast.success('Drafts refreshed from your latest platform data');
    } catch (refreshError) {
      toast.error(
        refreshError instanceof Error ? refreshError.message : 'Failed to refresh drafts',
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const checks = readiness?.documents.flatMap((doc) => doc.checks) ?? [];
  const done = checks.filter((check) => check.done).length;
  const nonconformities = readiness?.nonconformities;

  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <Stack gap="2">
            <div className="flex items-baseline justify-between gap-2">
              <Text size="sm" weight="medium">
                ISMS readiness (clauses 4–10)
              </Text>
              <Text size="sm" variant="muted">
                {readiness ? `${done} of ${checks.length} steps · ${readiness.percent}%` : ''}
              </Text>
            </div>
            {readiness ? (
              <Progress value={readiness.percent} aria-label="ISMS readiness" />
            ) : (
              <Text size="xs" variant={error ? 'destructive' : 'muted'}>
                {error ? 'Could not load progress.' : isLoading ? 'Checking progress…' : ''}
              </Text>
            )}
          </Stack>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/${organizationId}/documents/isms/nonconformities`}>
            <Button type="button" variant="outline" iconRight={<ArrowRight size={16} />}>
              Nonconformities
            </Button>
          </Link>
          {nonconformities && nonconformities.open > 0 ? (
            <Badge variant={nonconformities.overdue > 0 ? 'destructive' : 'secondary'}>
              {nonconformities.open} open
              {nonconformities.overdue > 0 ? ` · ${nonconformities.overdue} overdue` : ''}
            </Badge>
          ) : null}
          {canRefresh ? (
            <Button
              type="button"
              variant="outline"
              loading={isRefreshing}
              iconLeft={<Renew size={16} />}
              onClick={() => void handleRefresh()}
            >
              Refresh drafts
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
