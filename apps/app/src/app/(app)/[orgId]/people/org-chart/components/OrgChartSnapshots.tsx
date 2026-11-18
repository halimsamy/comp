'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { Button, Section, Text } from '@trycompai/design-system';
import { Camera, DocumentPdf, Image as ImageIcon } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { useOrgChartSnapshots } from '../hooks/useOrgChartSnapshots';
import { exportOrgChart } from '../lib/org-chart-export';
import type { ChartEdge, ChartNode } from '../lib/org-chart-svg';

interface OrgChartSnapshotsProps {
  name: string;
  nodes: ChartNode[];
  edges: ChartEdge[];
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** Export the current chart and keep dated snapshots as evidence of roles and reporting lines. */
export function OrgChartSnapshots({ name, nodes, edges }: OrgChartSnapshotsProps) {
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission('organization', 'update');
  const { snapshots, createSnapshot, getSnapshot } = useOrgChartSnapshots();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, task: () => Promise<void>, failure: string) => {
    setBusy(key);
    try {
      await task();
    } catch {
      toast.error(failure);
    } finally {
      setBusy(null);
    }
  };

  const handleExport = (format: 'png' | 'pdf') =>
    run(`current-${format}`, () => exportOrgChart({ nodes, edges, name, date: new Date(), format }), 'Export failed');

  const handleSnapshot = () =>
    run(
      'snapshot',
      async () => {
        await createSnapshot();
        toast.success('Snapshot saved');
      },
      'Failed to save snapshot',
    );

  const handleExportSnapshot = (id: string, format: 'png' | 'pdf') =>
    run(
      `${id}-${format}`,
      async () => {
        const snapshot = await getSnapshot(id);
        await exportOrgChart({
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          name: snapshot.name,
          date: new Date(snapshot.createdAt),
          format,
        });
      },
      'Export failed',
    );

  return (
    <Section
      title="Export and snapshots"
      description="Download the chart, or save a dated snapshot auditors can review later (ISO 27001 clause 5.3)."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" iconLeft={<ImageIcon size={14} />} loading={busy === 'current-png'} disabled={nodes.length === 0} onClick={() => handleExport('png')}>
            PNG
          </Button>
          <Button variant="outline" size="sm" iconLeft={<DocumentPdf size={14} />} loading={busy === 'current-pdf'} disabled={nodes.length === 0} onClick={() => handleExport('pdf')}>
            PDF
          </Button>
          {canUpdate && (
            <Button size="sm" iconLeft={<Camera size={14} />} loading={busy === 'snapshot'} disabled={nodes.length === 0} onClick={handleSnapshot}>
              Save snapshot
            </Button>
          )}
        </div>
      }
    >
      {snapshots.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center">
          <Text size="sm" variant="muted">
            No snapshots yet. Save one after each reorganization and at least once a year.
          </Text>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border">
          {snapshots.map((snapshot) => (
            <li key={snapshot.id} className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{snapshot.name}</div>
                <Text size="xs" variant="muted">
                  {formatDate(snapshot.createdAt)} · {snapshot.nodeCount} people
                </Text>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="ghost" size="sm" loading={busy === `${snapshot.id}-png`} onClick={() => handleExportSnapshot(snapshot.id, 'png')}>
                  PNG
                </Button>
                <Button variant="ghost" size="sm" loading={busy === `${snapshot.id}-pdf`} onClick={() => handleExportSnapshot(snapshot.id, 'pdf')}>
                  PDF
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
