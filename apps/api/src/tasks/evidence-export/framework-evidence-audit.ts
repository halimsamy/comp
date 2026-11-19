import { db } from '@db';
import type { Archiver } from 'archiver';
import { AuditWorkspaceService } from '../../audits/audit-workspace.service';
import type { AuthContext } from '../../auth/types';
import { toCsv } from './registers/register-csv';
import {
  appendAttachmentToArchive,
  createFilenameTracker,
} from './evidence-attachment-streamer';
import { safeSegment } from './framework-evidence-plan';

const name = (m: { user: { name: string | null; email: string } } | null | undefined) =>
  m ? m.user.name || m.user.email : '';

/** The job runs without a request; the controller already checked the caller can see the audit. */
function systemAuth(organizationId: string): AuthContext {
  return {
    organizationId,
    authType: 'service',
    isApiKey: false,
    isServiceToken: true,
    isPlatformAdmin: false,
    userRoles: null,
  };
}

/** audit-trail.csv: each requirement's readiness, the auditor's decision and the comment thread. */
export async function buildAuditTrailCsv({
  organizationId,
  auditId,
}: {
  organizationId: string;
  auditId: string;
}): Promise<string> {
  const [requirements, comments] = await Promise.all([
    new AuditWorkspaceService().listRequirements({ auth: systemAuth(organizationId), auditId }),
    db.auditComment.findMany({
      where: { auditId, audit: { organizationId } },
      include: { author: { select: { user: { select: { name: true, email: true } } } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const thread = (requirementId: string) =>
    comments
      .filter((c) => c.requirementId === requirementId)
      .map((c) => `${c.createdAt.toISOString().slice(0, 10)} ${name(c.author)}: ${c.content}`)
      .join('\n');

  return toCsv({
    headers: [
      'Requirement',
      'Name',
      'Readiness',
      'Auditor decision',
      'Decided by',
      'Decided at',
      'Decision note',
      'Open requests',
      'Comments',
    ],
    rows: requirements.map((r) => [
      r.identifier,
      r.name,
      r.readiness.replace(/_/g, ' '),
      r.review?.status ?? 'not reviewed',
      r.review?.reviewedBy ? r.review.reviewedBy.name || r.review.reviewedBy.email : '',
      r.review?.reviewedAt,
      r.review?.note,
      r.openRequestCount,
      thread(r.id),
    ]),
  });
}

/** Requests/<id>/: each evidence request with the team's response text and files. */
export async function appendAuditRequests({
  archive,
  root,
  organizationId,
  auditId,
  requirementLabels,
}: {
  archive: Archiver;
  root: string;
  organizationId: string;
  auditId: string;
  /** Requirement id -> "7.2.4 ..." folder name. */
  requirementLabels: Map<string, string>;
}): Promise<number> {
  const requests = await db.auditEvidenceRequest.findMany({
    where: { auditId, audit: { organizationId } },
    include: { requestedBy: { select: { user: { select: { name: true, email: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
  const files = await db.attachment.findMany({
    where: {
      organizationId,
      entityType: 'audit_request',
      entityId: { in: requests.map((r) => r.id) },
    },
    select: { id: true, name: true, url: true, entityId: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const request of requests) {
    const folderPath = `${root}/Requests/${safeSegment(request.id)}`;
    archive.append(
      [
        `Request: ${request.title}`,
        `Requirement: ${request.requirementId ? (requirementLabels.get(request.requirementId) ?? request.requirementId) : '-'}`,
        `Status: ${request.status}`,
        `Requested by: ${name(request.requestedBy) || '-'} on ${request.createdAt.toISOString().slice(0, 10)}`,
        `Due: ${request.dueDate ? request.dueDate.toISOString().slice(0, 10) : '-'}`,
        '',
        'Description:',
        request.description || '-',
        '',
        `Response${request.respondedAt ? ` (${request.respondedAt.toISOString().slice(0, 10)})` : ''}:`,
        request.response || '(no response yet)',
        '',
      ].join('\n'),
      { name: `${folderPath}/00-request.txt` },
    );
    const uniqueName = createFilenameTracker();
    for (const file of files.filter((f) => f.entityId === request.id)) {
      await appendAttachmentToArchive({ archive, attachment: file, folderPath, uniqueName });
    }
  }
  return requests.length;
}
