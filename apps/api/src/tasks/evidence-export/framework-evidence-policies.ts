import { db, type Prisma } from '@db';
import type { Archiver } from 'archiver';
import {
  buildDocumentControlRows,
  DOCUMENT_CONTROL_POLICY_SELECT,
  type DocumentControlRow,
} from '../../policies/lifecycle/policy-document-control.service';
import {
  appendAttachmentToArchive,
  createFilenameTracker,
} from './evidence-attachment-streamer';
import { safeSegment } from './framework-evidence-plan';

export type ApprovedPolicy = {
  id: string;
  name: string;
  version: number;
  content: Prisma.JsonValue[];
  pdfUrl: string | null;
  documentControl: DocumentControlRow[];
};

const { currentVersion: _currentVersion, ...policySelect } = DOCUMENT_CONTROL_POLICY_SELECT;

const person = { select: { user: { select: { name: true, email: true } } } } as const;

/**
 * The last approved version of each policy (approved by its approver, or
 * published directly before approvals existed — the same rule as the policy's
 * revision history). Drafts and versions waiting for approval are never
 * exported; policies with no approved version are returned by name so the
 * README can list them.
 */
export async function loadApprovedPolicies({
  organizationId,
  policyIds,
}: {
  organizationId: string;
  policyIds: string[];
}): Promise<{ approved: Map<string, ApprovedPolicy>; unapproved: string[] }> {
  const policies = await db.policy.findMany({
    where: { organizationId, isArchived: false, id: { in: policyIds } },
    select: {
      ...policySelect,
      versions: {
        where: { OR: [{ approvedAt: { not: null } }, { publishedById: { not: null } }] },
        orderBy: { version: 'desc' },
        take: 1,
        select: {
          version: true,
          content: true,
          pdfUrl: true,
          approvedAt: true,
          approvedBy: person,
          publishedBy: person,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const approved = new Map<string, ApprovedPolicy>();
  const unapproved: string[] = [];
  for (const { versions, ...policy } of policies) {
    const version = versions[0];
    if (!version) {
      unapproved.push(policy.name);
      continue;
    }
    approved.set(policy.id, {
      id: policy.id,
      name: policy.name,
      version: version.version,
      content: version.content,
      pdfUrl: version.pdfUrl,
      documentControl: buildDocumentControlRows({ ...policy, currentVersion: version }),
    });
  }
  return { approved, unapproved };
}

/** Append a folder's policies: the approved version's uploaded PDF, else a rendered one with its document-control header. */
export async function appendPolicies({
  archive,
  folderPath,
  policies,
  render,
}: {
  archive: Archiver;
  folderPath: string;
  policies: ApprovedPolicy[];
  /** Renders (and caches) one policy's PDF. */
  render: (policy: ApprovedPolicy) => Buffer;
}): Promise<void> {
  const uniquePolicyName = createFilenameTracker();
  for (const policy of policies) {
    const fileName = uniquePolicyName(`${safeSegment(policy.name)} v${policy.version}.pdf`);
    if (policy.pdfUrl) {
      await appendAttachmentToArchive({
        archive,
        attachment: { id: policy.id, name: fileName, url: policy.pdfUrl },
        folderPath,
        uniqueName: (name) => name,
      });
      continue;
    }
    archive.append(render(policy), { name: `${folderPath}/${fileName}` });
  }
}
