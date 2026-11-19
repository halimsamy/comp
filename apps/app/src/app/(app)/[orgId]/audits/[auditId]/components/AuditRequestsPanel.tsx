'use client';

import { useAuditRequests, type AuditRequirement } from '@/hooks/use-audits';
import { Button, Empty, EmptyDescription, EmptyHeader, EmptyTitle, Stack, Text } from '@trycompai/design-system';
import { Add } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { AuditRequestCard } from './AuditRequestCard';
import { ImportRequestsButton } from './ImportRequestsButton';
import { NewAuditRequestForm } from './NewAuditRequestForm';

/**
 * Evidence requests: auditors ask, the team answers with text and files. The
 * team can also log a request list the auditor sent by email (#109).
 */
export function AuditRequestsPanel({
  auditId,
  requirements,
  isAuditor,
  canRespond,
}: {
  auditId: string;
  requirements: AuditRequirement[];
  /** The viewer is one of this audit's auditors. */
  isAuditor: boolean;
  /** The viewer can answer requests (audit:update, not an auditor). */
  canRespond: boolean;
}) {
  const { requests, isLoading, error, create, createTeam, respond, decide, upload } =
    useAuditRequests(auditId);
  const [isAdding, setIsAdding] = useState(false);
  const labels = new Map(requirements.map((r) => [r.id, `${r.identifier} ${r.name}`.trim()]));

  return (
    <Stack gap="4">
      {isAuditor && !isAdding ? (
        <div>
          <Button iconLeft={<Add size={16} />} onClick={() => setIsAdding(true)}>
            Request evidence
          </Button>
        </div>
      ) : null}
      {canRespond && !isAdding ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" iconLeft={<Add size={16} />} onClick={() => setIsAdding(true)}>
            Add request
          </Button>
          <ImportRequestsButton requirements={requirements} onImport={createTeam} />
        </div>
      ) : null}
      {isAdding ? (
        <NewAuditRequestForm
          requirements={requirements}
          onSubmit={
            isAuditor ? create : async (payload) => void (await createTeam([payload]))
          }
          onCancel={() => setIsAdding(false)}
        />
      ) : null}
      {error ? (
        <Text size="sm" variant="destructive">
          Could not load evidence requests.
        </Text>
      ) : isLoading ? (
        <Text size="sm" variant="muted">
          Loading requests…
        </Text>
      ) : requests.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No evidence requests</EmptyTitle>
            <EmptyDescription>
              {isAuditor
                ? 'Ask the team for anything the linked evidence does not cover, such as samples or populations.'
                : 'When an auditor asks for more evidence, the request shows up here for you to answer.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        requests.map((request) => (
          <AuditRequestCard
            key={request.id}
            request={request}
            requirementLabel={request.requirementId ? (labels.get(request.requirementId) ?? null) : null}
            canRespond={canRespond}
            canDecide={isAuditor}
            actions={{ respond, decide, upload }}
          />
        ))
      )}
    </Stack>
  );
}
