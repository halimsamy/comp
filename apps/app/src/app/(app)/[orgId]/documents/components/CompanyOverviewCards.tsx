'use client';

import { conciseFormDescriptions } from '@/app/(app)/[orgId]/documents/form-descriptions';
import { useOrganizationFindings } from '@/hooks/use-findings-api';
import { FindingStatus } from '@db';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Stack,
  Text,
} from '@trycompai/design-system';
import Link from 'next/link';
import { useQueryState } from 'nuqs';
import { useMemo } from 'react';
import { evidenceFormDefinitionList, meetingSubTypeValues } from '../forms';
import { CompanyFormsTable } from './CompanyFormsTable';
import { useFormStatuses, type FormStatus, type FormStatuses } from './use-form-settings';

const MEETING_SUB_TYPES = meetingSubTypeValues;
const MEETING_ALL_TYPES = new Set<string>([...MEETING_SUB_TYPES, 'meeting']);

function isTodo(status: FormStatus | undefined): boolean {
  return status?.isFresh !== true;
}

function isMeetingTodo(statuses: FormStatuses): boolean {
  return MEETING_SUB_TYPES.every((subType) => isTodo(statuses[subType]));
}

function formatDue(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/** "Due Mar 2027" while current, "Overdue since …" once the cadence lapsed. */
function DueLabel({ status }: { status: FormStatus | undefined }) {
  if (!status?.nextDueAt) return null;
  return (
    <Text size="xs" variant={status.isFresh ? 'muted' : 'destructive'}>
      {status.isFresh ? 'Due' : 'Overdue since'} {formatDue(status.nextDueAt)}
    </Text>
  );
}

function StatusBadge({
  statuses,
  form,
  activeIssues,
}: {
  statuses: FormStatuses | undefined;
  form: (typeof evidenceFormDefinitionList)[number];
  activeIssues: number;
}) {
  if (!statuses) {
    return (
      <div className="flex items-center gap-1.5">
        <Text size="xs" variant="muted">
          {form.fields.length} fields
        </Text>
        {activeIssues > 0 && (
          <span className="inline-flex items-center rounded-sm bg-red-100 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider leading-none text-red-800 dark:bg-red-950/30 dark:text-red-400">
            {activeIssues === 1 ? '1 Issue' : `${activeIssues} Issues`}
          </span>
        )}
      </div>
    );
  }

  if (statuses[form.type]?.isNotRelevant === true) {
    return (
      <div className="flex items-center gap-1.5">
        <Badge variant="secondary">Not relevant</Badge>
        {activeIssues > 0 && (
          <span className="inline-flex items-center rounded-sm bg-red-100 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider leading-none text-red-800 dark:bg-red-950/30 dark:text-red-400">
            {activeIssues === 1 ? '1 Issue' : `${activeIssues} Issues`}
          </span>
        )}
      </div>
    );
  }

  const showTodo =
    form.type === 'meeting'
      ? isMeetingTodo(statuses)
      : isTodo(statuses[form.type]);

  const statusBadge = showTodo ? (
    form.optional ? (
      <Badge variant="outline">Optional</Badge>
    ) : (
      <span className="inline-flex items-center rounded-sm bg-amber-100 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider leading-none text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
        Todo
      </span>
    )
  ) : (
    <span className="inline-flex items-center rounded-sm bg-green-100 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider leading-none text-green-800 dark:bg-green-950/30 dark:text-green-400">
      Complete
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {statusBadge}
      {form.type !== 'meeting' && <DueLabel status={statuses[form.type]} />}
      {activeIssues > 0 && (
        <span className="inline-flex items-center rounded-sm bg-red-100 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider leading-none text-red-800 dark:bg-red-950/30 dark:text-red-400">
          {activeIssues === 1 ? '1 Issue' : `${activeIssues} Issues`}
        </span>
      )}
    </div>
  );
}

export function CompanyOverviewCards({ organizationId }: { organizationId: string }) {
  const { statuses, bulkSetOwner } = useFormStatuses(organizationId);
  const [view, setView] = useQueryState('view');

  const { data: findingsResponse } = useOrganizationFindings();

  const activeIssueCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const findings = findingsResponse?.data;
    if (!Array.isArray(findings)) return counts;

    for (const finding of findings) {
      if (finding.status === FindingStatus.closed) continue;

      const formType = finding.evidenceFormType ?? finding.evidenceSubmission?.formType;
      if (!formType) continue;

      if (MEETING_ALL_TYPES.has(formType)) {
        counts['meeting'] = (counts['meeting'] ?? 0) + 1;
      } else {
        counts[formType] = (counts[formType] ?? 0) + 1;
      }
    }
    return counts;
  }, [findingsResponse]);

  // Meeting minutes stay as a card that points to the ISMS management review (#176).
  const visibleForms = useMemo(
    () => evidenceFormDefinitionList.filter((form) => !form.hidden || form.type === 'meeting'),
    [],
  );
  const formHref = (form: (typeof evidenceFormDefinitionList)[number]) =>
    form.retiredTo ? `/${organizationId}${form.retiredTo.path}` : `/${organizationId}/documents/${form.type}`;

  const categories = useMemo(() => {
    const map = new Map<string, typeof evidenceFormDefinitionList>();
    for (const form of visibleForms) {
      const cat = form.category;
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(form);
    }
    return map;
  }, [visibleForms]);

  const viewToggle = (
    <div className="flex gap-2">
      <Button size="sm" variant={view === 'table' ? 'outline' : 'secondary'} onClick={() => setView(null)}>
        Cards
      </Button>
      <Button size="sm" variant={view === 'table' ? 'secondary' : 'outline'} onClick={() => setView('table')}>
        Table
      </Button>
    </div>
  );

  if (view === 'table') {
    return (
      <Stack gap="4">
        {viewToggle}
        <CompanyFormsTable
          organizationId={organizationId}
          forms={visibleForms.filter((form) => !form.retiredTo)}
          statuses={statuses}
          onBulkSetOwner={bulkSetOwner}
        />
      </Stack>
    );
  }

  return (
    <Stack gap="6">
      {viewToggle}
      {Array.from(categories.entries()).map(([category, forms]) => (
        <div key={category} className="space-y-3">
          <div className="flex items-center gap-2">
            <Text size="lg" weight="semibold">
              {category}
            </Text>
            <Badge variant="secondary">{forms.length}</Badge>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {forms.map((form) => (
              <Link key={form.type} href={formHref(form)}>
                <Card>
                  <CardHeader>
                    <CardTitle>{form.title}</CardTitle>
                    <div className="line-clamp-1">
                      <CardDescription>
                        {conciseFormDescriptions[form.type] ?? form.description}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {form.retiredTo ? (
                      <Text size="xs" variant="muted">
                        Now recorded in {form.retiredTo.label}
                      </Text>
                    ) : (
                    <StatusBadge
                      statuses={statuses}
                      form={form}
                      activeIssues={activeIssueCounts[form.type] ?? 0}
                    />
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </Stack>
  );
}
