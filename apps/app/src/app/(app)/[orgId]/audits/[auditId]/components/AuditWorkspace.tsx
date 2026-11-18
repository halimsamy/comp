'use client';

import {
  useAudit,
  useAuditRequirements,
  type Audit,
  type AuditRequirement,
  type AuditReviewStatus,
} from '@/hooks/use-audits';
import { usePermissions } from '@/hooks/use-permissions';
import {
  DataTableHeader,
  DataTableSearch,
  PageHeader,
  Stack,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from '@trycompai/design-system';
import { ArrowLeft } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useState } from 'react';
import { AuditProgressBar } from '../../components/AuditProgressBar';
import {
  ITEM_STATUS_LABELS,
  ITEM_STATUS_ORDER,
  countByStatus,
  itemStatus,
  type ItemStatus,
} from '../../lib/audit-labels';
import { AuditBanner } from './AuditBanner';
import { AuditExportButton } from './AuditExportButton';
import { AuditRequestsPanel } from './AuditRequestsPanel';
import { RequirementSheet } from './RequirementSheet';
import { RequirementsTable } from './RequirementsTable';

const matches = ({ requirement, search }: { requirement: AuditRequirement; search: string }) => {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return `${requirement.identifier} ${requirement.name}`.toLowerCase().includes(query);
};

/** The auditor workspace: banner, progress, requirement table with status tabs, and requests. */
export function AuditWorkspace({ orgId, initialAudit }: { orgId: string; initialAudit: Audit }) {
  const { hasPermission } = usePermissions();
  const { audit = initialAudit, mutate: refreshAudit } = useAudit({
    auditId: initialAudit.id,
    initialData: initialAudit,
  });
  const { requirements, isLoading, error, review } = useAuditRequirements(audit.id);
  const [status, setStatus] = useState<ItemStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = countByStatus(requirements);
  const searched = requirements.filter((requirement) => matches({ requirement, search }));
  const visible = searched.filter((r) => status === 'all' || itemStatus(r) === status);
  const open = requirements.find((r) => r.id === openId) ?? null;
  const canExport = hasPermission('evidence', 'read') && hasPermission('policy', 'read');

  const handleReview = async (input: { status: AuditReviewStatus | null; note?: string }) => {
    if (!open) return;
    await review({ requirementId: open.id, ...input });
    await refreshAudit();
  };

  return (
    <Stack gap="6">
      <Link href={`/${orgId}/audits`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> All audits
      </Link>
      <AuditBanner audit={audit} />
      <PageHeader title="Evidence" actions={canExport ? <AuditExportButton audit={audit} /> : undefined} />
      <div className="rounded-lg border border-border p-4">
        <Stack gap="2">
          <Text size="sm" weight="semibold">
            Audit progress
          </Text>
          <AuditProgressBar progress={audit.progress} />
        </Stack>
      </div>
      <Tabs defaultValue="requirements">
        <TabsList>
          <TabsTrigger value="requirements">Requirements ({requirements.length})</TabsTrigger>
          <TabsTrigger value="requests">Evidence requests ({audit.openRequests} open)</TabsTrigger>
        </TabsList>
        <TabsContent value="requirements">
          <Stack gap="4">
            <DataTableHeader>
              <DataTableSearch placeholder="Search requirements" value={search} onChange={setSearch} />
            </DataTableHeader>
            <Tabs
              value={status}
              onValueChange={(next) => setStatus(ITEM_STATUS_ORDER.find((s) => s === next) ?? 'all')}
            >
              <TabsList>
                <TabsTrigger value="all">All ({requirements.length})</TabsTrigger>
                {ITEM_STATUS_ORDER.map((key) => (
                  <TabsTrigger key={key} value={key}>
                    {ITEM_STATUS_LABELS[key]} ({counts[key]})
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {error ? (
              <Text size="sm" variant="destructive">
                Could not load the requirements. Refresh the page to try again.
              </Text>
            ) : isLoading ? (
              <Text size="sm" variant="muted">
                Loading requirements and evidence…
              </Text>
            ) : visible.length === 0 ? (
              <Text size="sm" variant="muted">
                No requirements match.
              </Text>
            ) : (
              <RequirementsTable requirements={visible} onOpen={(r) => setOpenId(r.id)} />
            )}
          </Stack>
        </TabsContent>
        <TabsContent value="requests">
          <AuditRequestsPanel
            auditId={audit.id}
            requirements={requirements}
            isAuditor={audit.viewerIsAuditor}
            canRespond={!audit.viewerIsAuditor && hasPermission('audit', 'update')}
          />
        </TabsContent>
      </Tabs>
      <RequirementSheet
        orgId={orgId}
        auditId={audit.id}
        requirement={open}
        canAssess={audit.viewerIsAuditor}
        onOpenChange={(next) => (next ? undefined : setOpenId(null))}
        onReview={handleReview}
      />
    </Stack>
  );
}
