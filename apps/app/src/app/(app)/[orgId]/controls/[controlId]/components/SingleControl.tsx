'use client';

import { summarizeEvidence, useControlEvidence } from '@/hooks/use-control-evidence';
import type { Policy, Task } from '@db';
import {
  Badge,
  Stack,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from '@trycompai/design-system';
import { useState } from 'react';
import { ControlEvidenceTable } from './ControlEvidenceTable';
import { ControlHistory } from './ControlHistory';
import { DocumentsTable } from './DocumentsTable';
import { LinkDocumentTypeSheet } from './LinkDocumentTypeSheet';
import { LinkPolicySheet } from './LinkPolicySheet';
import { LinkRequirementForControlSheet } from './LinkRequirementForControlSheet';
import { LinkTaskSheet } from './LinkTaskSheet';
import { PoliciesTable } from './PoliciesTable';
import { type MappedRequirement, RequirementsTable } from './RequirementsTable';
import { TasksTable } from './TasksTable';

export interface UnifiedControl {
  id: string;
  policies: Policy[];
  tasks: Task[];
  controlDocumentTypes?: { formType: string; isNotRelevant?: boolean }[];
  submissionCountsByFormType?: Record<string, number>;
  requirementsMapped: MappedRequirement[];
  applicability?: Record<string, string>;
}

/** Status line under the header: Done / In progress / Not started plus "Evidence OK x/y". */
export function ControlEvidenceStatus({ controlId }: { controlId: string }) {
  const { items, isLoading, error } = useControlEvidence([controlId]);
  if (isLoading || error) return null;
  const { complete, total } = summarizeEvidence(items);
  const label = total === 0 ? 'No evidence' : complete === total ? 'Done' : complete > 0 ? 'In progress' : 'Not started';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={complete === total && total > 0 ? 'default' : 'secondary'}>{label}</Badge>
      <Text size="sm" variant="muted">{`Evidence OK ${complete}/${total}`}</Text>
    </div>
  );
}

export function SingleControl({
  orgId,
  control,
  frameworkInstanceId,
}: {
  orgId: string;
  control: UnifiedControl;
  /** From ?framework=: new links are scoped to that framework, like the old framework page. */
  frameworkInstanceId: string | null;
}) {
  const [tab, setTab] = useState('policies');
  const evidence = useControlEvidence([control.id]);
  const ismsDocuments = evidence.items.filter((i) => i.kind === 'isms_document');
  const documentRows = (control.controlDocumentTypes ?? []).map((d) => ({
    formType: d.formType,
    isNotRelevant: d.isNotRelevant === true,
    submissionCount: control.submissionCountsByFormType?.[d.formType] ?? 0,
  }));
  const requirementKeys = control.requirementsMapped.flatMap((r) => r.requirementId ?? r.customRequirementId ?? []);

  const action =
    tab === 'policies' ? (
      <LinkPolicySheet controlId={control.id} frameworkInstanceId={frameworkInstanceId} alreadyLinkedPolicyIds={control.policies.map((p) => p.id)} />
    ) : tab === 'tasks' ? (
      <LinkTaskSheet controlId={control.id} frameworkInstanceId={frameworkInstanceId} alreadyLinkedTaskIds={control.tasks.map((t) => t.id)} />
    ) : tab === 'documents' ? (
      <LinkDocumentTypeSheet controlId={control.id} frameworkInstanceId={frameworkInstanceId} alreadyLinkedFormTypes={documentRows.map((d) => d.formType)} />
    ) : tab === 'requirements' ? (
      <LinkRequirementForControlSheet controlId={control.id} alreadyLinkedRequirementIds={requirementKeys} />
    ) : null;

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <Stack gap="lg">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-full overflow-x-auto">
            <TabsList variant="underline">
              <TabsTrigger value="policies">Policies ({control.policies.length})</TabsTrigger>
              <TabsTrigger value="tasks">Tasks ({control.tasks.length})</TabsTrigger>
              <TabsTrigger value="documents">Documents ({documentRows.length + ismsDocuments.length})</TabsTrigger>
              <TabsTrigger value="requirements">Requirements ({control.requirementsMapped.length})</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>

        <TabsContent value="policies">
          <PoliciesTable policies={control.policies} orgId={orgId} />
        </TabsContent>
        <TabsContent value="tasks">
          <TasksTable tasks={control.tasks} orgId={orgId} />
        </TabsContent>
        <TabsContent value="documents">
          <Stack gap="lg">
            <DocumentsTable controlId={control.id} orgId={orgId} rows={documentRows} />
            <Stack gap="sm">
              <Text size="sm" weight="medium">ISMS documents</Text>
              <ControlEvidenceTable
                orgId={orgId}
                items={ismsDocuments}
                isLoading={evidence.isLoading}
                error={evidence.error}
                emptyText="No ISMS documents linked."
              />
            </Stack>
          </Stack>
        </TabsContent>
        <TabsContent value="requirements">
          <RequirementsTable requirements={control.requirementsMapped} applicability={control.applicability ?? {}} orgId={orgId} />
        </TabsContent>
        <TabsContent value="history">
          <ControlHistory
            controlId={control.id}
            frameworkInstanceIds={control.requirementsMapped.map((r) => r.frameworkInstanceId)}
            requirementKeys={requirementKeys}
          />
        </TabsContent>
      </Stack>
    </Tabs>
  );
}
