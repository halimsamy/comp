'use client';

import { stripIdentifier } from '@/app/(app)/[orgId]/frameworks/[frameworkInstanceId]/components/requirement-name';
import { APPLICABILITY_LABELS, type ApplicabilityStatus } from '@/lib/control-compliance';
import { Badge, Heading, Text } from '@trycompai/design-system';
import Link from 'next/link';

export interface MappedRequirement {
  id: string;
  frameworkInstanceId: string;
  requirementId: string | null;
  customRequirementId: string | null;
  frameworkInstance: {
    framework: { name: string } | null;
    customFramework?: { name: string } | null;
  };
  requirement: { identifier: string; name: string } | null;
  customRequirement?: { identifier: string; name: string } | null;
}

/** Mapped requirements grouped by framework, each with its applicability. */
export function RequirementsTable({
  requirements,
  applicability,
  orgId,
}: {
  requirements: MappedRequirement[];
  /** Status keyed `${frameworkInstanceId}:${requirementKey}`; missing means applicable. */
  applicability: Record<string, string>;
  orgId: string;
}) {
  if (requirements.length === 0) {
    return (
      <Text size="sm" variant="muted">
        This control is not mapped to any requirement yet.
      </Text>
    );
  }

  const groups = new Map<string, { name: string; rows: MappedRequirement[] }>();
  for (const row of requirements) {
    const name = row.frameworkInstance.framework?.name ?? row.frameworkInstance.customFramework?.name ?? 'Framework';
    const group = groups.get(row.frameworkInstanceId) ?? { name, rows: [] };
    group.rows.push(row);
    groups.set(row.frameworkInstanceId, group);
  }

  return (
    <div className="flex flex-col gap-6">
      {[...groups.entries()].map(([frameworkInstanceId, group]) => (
        <section key={frameworkInstanceId} className="flex flex-col gap-2">
          <Heading level="4">{`${group.name} (${group.rows.length})`}</Heading>
          <ul className="divide-y rounded-md border">
            {group.rows.map((row) => {
              const req = row.requirement ?? row.customRequirement;
              const key = row.requirementId ?? row.customRequirementId ?? '';
              const status = (applicability[`${frameworkInstanceId}:${key}`] ?? 'applicable') as ApplicabilityStatus;
              return (
                <li key={row.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <Link
                    href={`/${orgId}/frameworks/${frameworkInstanceId}/requirements/${key}`}
                    className="min-w-0 text-sm hover:underline"
                  >
                    <span className="font-mono">{req?.identifier}</span>{' '}
                    <span>{req ? stripIdentifier({ name: req.name, identifier: req.identifier }) : key}</span>
                  </Link>
                  <div className="shrink-0">
                    <Badge variant={status === 'applicable' ? 'secondary' : 'outline'}>
                      {APPLICABILITY_LABELS[status] ?? status}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
