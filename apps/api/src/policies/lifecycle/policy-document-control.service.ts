import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { db } from '@db';
import { APP_AWS_ORG_ASSETS_BUCKET, s3Client } from '../../app/s3';

const MAX_LOGO_BYTES = 1024 * 1024;

export interface DocumentControlRow {
  label: string;
  value: string;
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '—';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function personName(
  member: { user: { name: string | null; email: string } } | null | undefined,
): string {
  if (!member) return '—';
  return member.user.name || member.user.email;
}

export const DOCUMENT_CONTROL_POLICY_SELECT = {
  id: true,
  name: true,
  status: true,
  lastPublishedAt: true,
  reviewDate: true,
  frequency: true,
  visibility: true,
  visibleToDepartments: true,
  assignee: { select: { user: { select: { name: true, email: true } } } },
  currentVersion: {
    select: {
      version: true,
      approvedAt: true,
      approvedBy: { select: { user: { select: { name: true, email: true } } } },
      publishedBy: { select: { user: { select: { name: true, email: true } } } },
    },
  },
  reviews: {
    orderBy: { reviewedAt: 'desc' as const },
    take: 1,
    select: { reviewedAt: true },
  },
} as const;

type DocumentControlPolicy = {
  status: string;
  lastPublishedAt: Date | null;
  reviewDate: Date | null;
  frequency: string | null;
  visibility: string;
  visibleToDepartments: string[];
  assignee: { user: { name: string | null; email: string } } | null;
  currentVersion: {
    version: number;
    approvedAt: Date | null;
    approvedBy: { user: { name: string | null; email: string } } | null;
    publishedBy: { user: { name: string | null; email: string } } | null;
  } | null;
  reviews: { reviewedAt: Date }[];
};

/** The document-control block printed at the top of every policy PDF. */
export function buildDocumentControlRows(
  policy: DocumentControlPolicy,
): DocumentControlRow[] {
  const version = policy.currentVersion;
  const approver = version?.approvedBy ?? version?.publishedBy ?? null;
  return [
    { label: 'Policy owner', value: personName(policy.assignee) },
    { label: 'Version', value: version ? `v${version.version}` : 'Draft' },
    { label: 'Approved by', value: personName(approver) },
    {
      label: 'Approval date',
      value: formatDate(version?.approvedAt ?? policy.lastPublishedAt),
    },
    { label: 'Effective date', value: formatDate(policy.lastPublishedAt) },
    {
      label: 'Last reviewed',
      value: formatDate(policy.reviews[0]?.reviewedAt ?? policy.lastPublishedAt),
    },
    { label: 'Next review', value: formatDate(policy.reviewDate) },
    {
      label: 'Review frequency',
      value: policy.frequency ? capitalize(policy.frequency) : 'Not set',
    },
    { label: 'Classification', value: classification(policy) },
  ];
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Policies are internal documents; the audience comes from portal visibility. */
function classification(policy: Pick<DocumentControlPolicy, 'visibility' | 'visibleToDepartments'>) {
  if (policy.visibility === 'DEPARTMENT' && policy.visibleToDepartments.length > 0) {
    return `Internal - ${policy.visibleToDepartments.map((d) => d.toUpperCase()).join(', ')}`;
  }
  return 'Internal - all employees';
}

/** Approved (or legacy-published) versions, newest first, for "Revision history". */
export async function getRevisionHistory(policyId: string) {
  const policy = await db.policy.findUnique({
    where: { id: policyId },
    select: { currentVersion: { select: { version: true } } },
  });
  const currentVersion = policy?.currentVersion?.version ?? 0;
  const versions = await db.policyVersion.findMany({
    where: {
      policyId,
      // publishedById is also set on rejected/pending drafts, so it only counts up to the live version.
      OR: [
        { approvedAt: { not: null } },
        { publishedById: { not: null }, version: { lte: currentVersion } },
      ],
    },
    orderBy: { version: 'desc' },
    select: {
      version: true,
      changelog: true,
      approvedAt: true,
      createdAt: true,
      approvedBy: { select: { user: { select: { name: true, email: true } } } },
      publishedBy: { select: { user: { select: { name: true, email: true } } } },
    },
  });
  return versions.map((v) => ({
    version: `v${v.version}`,
    date: formatDate(v.approvedAt ?? v.createdAt),
    approvedBy: personName(v.approvedBy ?? v.publishedBy),
    changes: v.changelog?.trim() || '—',
  }));
}

@Injectable()
export class PolicyDocumentControlService {
  private readonly logger = new Logger(PolicyDocumentControlService.name);

  async get({
    policyId,
    organizationId,
  }: {
    policyId: string;
    organizationId: string;
  }) {
    const [policy, organization] = await Promise.all([
      db.policy.findFirst({
        where: { id: policyId, organizationId },
        select: DOCUMENT_CONTROL_POLICY_SELECT,
      }),
      db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, logo: true, primaryColor: true },
      }),
    ]);
    if (!policy || !organization) {
      throw new NotFoundException(`Policy with ID ${policyId} not found`);
    }
    return {
      policyName: policy.name,
      organizationName: organization.name,
      primaryColor: organization.primaryColor,
      logo: await this.getLogo({ logoKey: organization.logo, organizationId }),
      rows: buildDocumentControlRows(policy),
      revisions: await getRevisionHistory(policyId),
    };
  }

  /** Inline the org logo so the browser PDF generator avoids S3 CORS. */
  private async getLogo({
    logoKey,
    organizationId,
  }: {
    logoKey: string | null;
    organizationId: string;
  }): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
    if (!logoKey || !s3Client || !APP_AWS_ORG_ASSETS_BUCKET) return null;
    // Logo keys are tenant-scoped; never read another org's object.
    if (!logoKey.startsWith(`${organizationId}/`)) return null;
    try {
      const response = await s3Client.send(
        new GetObjectCommand({ Bucket: APP_AWS_ORG_ASSETS_BUCKET, Key: logoKey }),
      );
      const type = response.ContentType ?? '';
      const format = type.includes('png')
        ? 'PNG'
        : type.includes('jpeg') || type.includes('jpg')
          ? 'JPEG'
          : null;
      if (!response.Body) return null;
      if (!format || (response.ContentLength ?? 0) > MAX_LOGO_BYTES) {
        // An unread body holds an S3 socket until it is released.
        if (response.Body instanceof Readable) response.Body.destroy();
        return null;
      }
      const bytes = await response.Body.transformToByteArray();
      if (bytes.byteLength > MAX_LOGO_BYTES) return null;
      return {
        dataUrl: `data:${type};base64,${Buffer.from(bytes).toString('base64')}`,
        format,
      };
    } catch (error) {
      this.logger.warn(
        `Could not load logo for organization ${organizationId}`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }
}
