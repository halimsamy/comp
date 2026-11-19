import { z } from 'zod';
import type { Prisma } from '@db';
import type { GoverningPolicyExport } from './types';

// Type-only @db import: the export builders import this file and must not load
// the db client. Callers pass `db` or a transaction client.
type Client = Pick<Prisma.TransactionClient, 'policy'>;

/**
 * The optional link from the 9.2 programme / 9.3 procedure narrative to the
 * org policy that defines it. The policy id lives in the narrative JSON (no
 * FK), so every read re-checks org scope and archive state.
 */
export const governingPolicyIdSchema = z.string().trim().min(1).optional();

const linkSchema = z.object({ governingPolicyId: z.string().min(1) });

/** The linked policy's id from a stored narrative, or null. */
export function governingPolicyIdOf(narrative: unknown): string | null {
  const parsed = linkSchema.safeParse(narrative);
  return parsed.success ? parsed.data.governingPolicyId : null;
}

/** Org-scoped, non-archived policy lookup; null when missing, archived or another org's. */
export function findGoverningPolicy({
  organizationId,
  policyId,
  client,
}: {
  organizationId: string;
  policyId: string;
  client: Client;
}) {
  return client.policy.findFirst({
    where: {
      id: policyId,
      organizationId,
      isArchived: false,
      archivedAt: null,
    },
    select: {
      name: true,
      status: true,
      lastPublishedAt: true,
      currentVersion: { select: { version: true } },
    },
  });
}

/**
 * Resolve the narrative's linked policy for the export input. Undefined when
 * nothing is linked or the policy is gone, so the export falls back to the
 * paragraph. Frozen into the version contentSnapshot at approval.
 */
export async function resolveGoverningPolicy({
  organizationId,
  narrative,
  client,
}: {
  organizationId: string;
  narrative: unknown;
  client: Client;
}): Promise<GoverningPolicyExport | undefined> {
  const policyId = governingPolicyIdOf(narrative);
  if (!policyId) return undefined;
  const policy = await findGoverningPolicy({
    organizationId,
    policyId,
    client,
  });
  if (!policy) return undefined;
  return {
    name: policy.name,
    status: policy.status,
    version: policy.currentVersion?.version ?? null,
    lastPublishedAt: policy.lastPublishedAt
      ? policy.lastPublishedAt.toISOString().slice(0, 10)
      : null,
  };
}

/** "Defined in the policy 'X' (version 3, published 2026-05-01)." */
export function governingPolicyText(policy: GoverningPolicyExport): string {
  const details = [
    policy.version ? `version ${policy.version}` : null,
    policy.lastPublishedAt
      ? `published ${policy.lastPublishedAt}`
      : 'not yet published',
  ]
    .filter(Boolean)
    .join(', ');
  return `Defined in the policy '${policy.name}' (${details}).`;
}
