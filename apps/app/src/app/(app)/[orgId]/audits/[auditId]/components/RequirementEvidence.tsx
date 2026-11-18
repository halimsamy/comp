import type { AuditRequirement } from '@/hooks/use-audits';
import { Badge, Stack, Text } from '@trycompai/design-system';
import Link from 'next/link';
import type { ReactNode } from 'react';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="2">
      <Text size="xs" variant="muted" weight="medium">
        {title}
      </Text>
      {children}
    </Stack>
  );
}

function Row({ href, label, meta }: { href: string | null; label: string; meta: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-2.5 sm:flex-row sm:items-center sm:justify-between">
      {href ? (
        <Link href={href} className="text-sm font-medium hover:underline">
          {label}
        </Link>
      ) : (
        <Text size="sm" weight="medium">
          {label}
        </Text>
      )}
      <div className="flex flex-wrap items-center gap-2">{meta}</div>
    </div>
  );
}

/** The tasks, policies and documents behind a requirement, linked to their pages. */
export function RequirementEvidence({
  orgId,
  requirement,
}: {
  orgId: string;
  requirement: AuditRequirement;
}) {
  const { tasks, policies, documents, controls } = requirement;
  if (tasks.length + policies.length + documents.length === 0) {
    return (
      <Text size="sm" variant="muted">
        No evidence is linked to this requirement's controls yet.
      </Text>
    );
  }
  return (
    <Stack gap="4">
      {controls.length > 0 ? (
        <Text size="xs" variant="muted">
          Controls: {controls.join(', ')}
        </Text>
      ) : null}
      {tasks.length > 0 ? (
        <Group title="Tasks">
          {tasks.map((task) => (
            <Row
              key={task.id}
              href={`/${orgId}/tasks/${task.id}`}
              label={task.title}
              meta={
                <>
                  {task.needsUpdate ? <Badge variant="destructive">Needs update</Badge> : null}
                  <Badge variant={task.status === 'done' ? 'default' : 'secondary'}>
                    {task.status.replace('_', ' ')}
                  </Badge>
                  <Text size="xs" variant="muted">
                    {task.filesInPeriod} files in period
                  </Text>
                </>
              }
            />
          ))}
        </Group>
      ) : null}
      {policies.length > 0 ? (
        <Group title="Policies">
          {policies.map((policy) => (
            <Row
              key={policy.id}
              href={`/${orgId}/policies/${policy.id}`}
              label={policy.name}
              meta={
                <Badge variant={policy.status === 'published' ? 'default' : 'secondary'}>
                  {policy.status.replace('_', ' ')}
                </Badge>
              }
            />
          ))}
        </Group>
      ) : null}
      {documents.length > 0 ? (
        <Group title="Documents">
          {documents.map((doc) => (
            <Row
              key={doc.formType}
              href={doc.slug ? `/${orgId}/documents/${doc.slug}` : null}
              label={doc.title}
              meta={
                <Badge variant={doc.submissionsInPeriod > 0 ? 'default' : 'destructive'}>
                  {doc.submissionsInPeriod} in period
                </Badge>
              }
            />
          ))}
        </Group>
      ) : null}
    </Stack>
  );
}
