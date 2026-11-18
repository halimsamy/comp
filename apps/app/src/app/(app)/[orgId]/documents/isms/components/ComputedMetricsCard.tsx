'use client';

import { api } from '@/lib/api-client';
import { Badge, Button, Section, Stack, Text } from '@trycompai/design-system';
import { Calculator } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

export interface ComputedMetricPreview {
  metricId: string;
  metricKey: string;
  name: string;
  cadence: string;
  periodStart: string;
  value: string;
  note: string;
  recordedForPeriod: boolean;
}

/**
 * 9.1 metrics Comp AI measures from its own data (training, policy sign-off,
 * findings, risk treatment, vendor reviews, task on-time rate). A monthly job
 * records them at period close; this card shows the live values and lets a
 * manager record the current period now.
 */
export function ComputedMetricsCard({
  organizationId,
  documentId,
  canRecord,
  onRecorded,
}: {
  organizationId: string;
  documentId: string;
  canRecord: boolean;
  onRecorded: () => Promise<unknown>;
}) {
  const endpoint = `/v1/isms/documents/${documentId}/metrics/computed`;
  const { data, error, mutate } = useSWR<ComputedMetricPreview[]>(
    [endpoint, organizationId],
    async () => {
      const response = await api.get<ComputedMetricPreview[]>(endpoint, organizationId);
      if (response.error) throw new Error(response.error);
      return Array.isArray(response.data) ? response.data : [];
    },
  );
  const [isRecording, setIsRecording] = useState(false);

  if (error) {
    return (
      <Text size="sm" variant="muted">
        Computed metrics are unavailable right now.
      </Text>
    );
  }
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return null;

  const pending = rows.filter((row) => !row.recordedForPeriod && row.value !== 'n/a').length;

  const handleRecord = async () => {
    setIsRecording(true);
    try {
      const response = await api.post<{ count: number }>(
        `${endpoint}/record`,
        { period: 'current' },
        organizationId,
      );
      if (response.error) throw new Error(response.error);
      const count = response.data?.count ?? 0;
      toast.success(count === 1 ? 'Recorded 1 measurement' : `Recorded ${count} measurements`);
      await Promise.all([mutate(), onRecorded()]);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to record metrics');
    } finally {
      setIsRecording(false);
    }
  };

  return (
    <Section
      title="Computed by Comp AI"
      description="Measured from your platform data and recorded automatically when each period closes. Periods you have already recorded are never overwritten."
      actions={
        canRecord && pending > 0 ? (
          <Button
            type="button"
            variant="outline"
            loading={isRecording}
            iconLeft={<Calculator size={16} />}
            onClick={() => void handleRecord()}
          >
            Record {pending} for this period
          </Button>
        ) : undefined
      }
    >
      <ul className="divide-y rounded-md border">
        {rows.map((row) => (
          <li
            key={row.metricId}
            className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0">
              <Stack gap="1">
                <Text size="sm" weight="medium">
                  {row.name}
                </Text>
                <Text size="xs" variant="muted">
                  {row.note}
                </Text>
              </Stack>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Text size="sm" weight="semibold">
                {row.value}
              </Text>
              <Badge variant={row.recordedForPeriod ? 'accent' : 'outline'}>
                {row.recordedForPeriod
                  ? `Recorded for ${row.periodStart}`
                  : `Due for ${row.periodStart}`}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
