import type { AccessReviewDecision } from '@db';
import type { IsmsExportSection } from '../isms/utils/export-shared';
import { formatExportDate } from '../isms/utils/export-shared';
import { renderIsmsPdf } from '../isms/utils/pdf-renderer';

export const FLAG_LABELS: Record<string, string> = {
  owner_departed: 'Owner left',
  unmapped: 'No owner',
  admin: 'Admin',
  no_mfa: 'No MFA',
  inactive: 'Inactive 90+ days',
  no_activity: 'Never used 90+ days',
  role_not_approved: 'Role not approved',
  admin_role_unapproved: 'Admin without approved role',
  type_not_allowed: 'Account type not allowed',
};

const DECISION_LABELS: Record<AccessReviewDecision, string> = {
  keep: 'Keep',
  revoke: 'Revoke',
  modify: 'Modify',
};

interface SummaryItem {
  decision: AccessReviewDecision | null;
  flags: string[];
  remediatedAt: Date | null;
}

export function summarizeItems(items: SummaryItem[]) {
  const count = (fn: (i: SummaryItem) => boolean) => items.filter(fn).length;
  return {
    total: items.length,
    decided: count((i) => i.decision !== null),
    kept: count((i) => i.decision === 'keep'),
    revoked: count((i) => i.decision === 'revoke'),
    modified: count((i) => i.decision === 'modify'),
    flagged: count((i) => i.flags.length > 0),
    pendingRemediation: count(
      (i) =>
        (i.decision === 'revoke' || i.decision === 'modify') && !i.remediatedAt,
    ),
  };
}

export interface ReportItem extends SummaryItem {
  reviewSystemId: string;
  accountName: string;
  email: string | null;
  ownerName: string | null;
  roles: string[];
  mfaEnabled: boolean | null;
  lastLoginAt: Date | null;
  comment: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  remediationNote: string | null;
  remediationUrl?: string | null;
}

export interface ReportReview {
  id: string;
  name: string;
  status: string;
  dueDate: Date;
  createdAt: Date;
  createdByName: string | null;
  signedOffByName: string | null;
  signedOffAt: Date | null;
  signOffNote: string | null;
  systems: { id: string; systemName: string; reviewerName: string | null }[];
  items: ReportItem[];
}

const mfaLabel = (value: boolean | null) =>
  value === null ? '—' : value ? 'Yes' : 'No';

function buildSections(review: ReportReview): IsmsExportSection[] {
  const s = summarizeItems(review.items);
  const actions = review.items.filter(
    (i) => i.decision === 'revoke' || i.decision === 'modify',
  );
  return [
    {
      heading: 'Summary',
      keyValues: [
        { label: 'Review', value: review.name },
        {
          label: 'Status',
          value: review.status === 'completed' ? 'Completed' : 'In progress',
        },
        {
          label: 'Started',
          value: `${formatExportDate(review.createdAt)} by ${review.createdByName ?? '—'}`,
        },
        { label: 'Due date', value: formatExportDate(review.dueDate) },
        { label: 'Accounts reviewed', value: `${s.decided} of ${s.total}` },
        {
          label: 'Decisions',
          value: `${s.kept} kept, ${s.revoked} revoked, ${s.modified} modified`,
        },
        { label: 'Flagged at start', value: String(s.flagged) },
        {
          label: 'Management sign-off',
          value: review.signedOffAt
            ? `${review.signedOffByName ?? '—'} on ${formatExportDate(review.signedOffAt)}`
            : 'Not signed off',
        },
        ...(review.signOffNote
          ? [{ label: 'Sign-off note', value: review.signOffNote }]
          : []),
      ],
    },
    {
      heading: 'Scope and reviewers',
      intro:
        'User accounts, including third-party and system accounts, and their privileges were reviewed to confirm access remains appropriate for each job function (ISO/IEC 27001:2022 A.5.18; PCI DSS v4.0.1 7.2.4, 7.2.5.1). Accounts inactive for more than 90 days were flagged (PCI DSS 8.2.6).',
      bullets: review.systems.map((sys) => {
        const n = review.items.filter(
          (i) => i.reviewSystemId === sys.id,
        ).length;
        return `${sys.systemName}: ${n} accounts, reviewer ${sys.reviewerName ?? 'not assigned'}`;
      }),
    },
    ...review.systems.map((sys) => ({
      heading: `Accounts: ${sys.systemName}`,
      table: {
        headers: [
          'Account',
          'Owner',
          'Roles',
          'MFA',
          'Last login',
          'Flags',
          'Decision',
          'Justification',
        ],
        rows: review.items
          .filter((i) => i.reviewSystemId === sys.id)
          .map((i) => [
            i.email && i.email !== i.accountName
              ? `${i.accountName}\n${i.email}`
              : i.accountName,
            i.ownerName ?? '—',
            i.roles.join(', ') || '—',
            mfaLabel(i.mfaEnabled),
            formatExportDate(i.lastLoginAt),
            i.flags.map((f) => FLAG_LABELS[f] ?? f).join(', ') || '—',
            i.decision
              ? `${DECISION_LABELS[i.decision]}\n${i.decidedByName ?? '—'}, ${formatExportDate(i.decidedAt)}`
              : 'Pending',
            i.comment ?? '',
          ]),
      },
    })),
    {
      heading: 'Access changes',
      intro: actions.length
        ? 'Inappropriate access found in this review and how it was addressed.'
        : 'No access changes were needed.',
      ...(actions.length > 0 && {
        table: {
          headers: [
            'Account',
            'Decision',
            'Reason',
            'Completed',
            'Remediation note',
          ],
          rows: actions.map((i) => [
            i.accountName,
            i.decision ? DECISION_LABELS[i.decision] : '',
            i.comment ?? '',
            formatExportDate(i.remediatedAt),
            [i.remediationNote, i.remediationUrl].filter(Boolean).join('\n'),
          ]),
        },
      }),
    },
  ];
}

export function renderAccessReviewPdf({
  review,
  organizationName,
  primaryColor,
}: {
  review: ReportReview;
  organizationName: string | null;
  primaryColor: string | null;
}): Buffer {
  return renderIsmsPdf({
    sections: buildSections(review),
    metadata: {
      title: `User access review: ${review.name}`,
      clause: 'A.5.18 (PCI DSS v4.0.1 7.2.4, 7.2.5.1, 8.2.6)',
      documentCode: `AR-${review.id.slice(-8).toUpperCase()}`,
      standardLabel: 'ISO/IEC 27001:2022',
      frameworkName: 'ISO 27001',
      version: 1,
      preparedBy: review.createdByName,
      owner: review.createdByName,
      status: review.status === 'completed' ? 'approved' : 'draft',
      approverName: review.signedOffByName,
      approvedAt: review.signedOffAt,
      declinedAt: null,
      classification: 'Confidential',
      nextReview: 'At least every six months (PCI DSS 7.2.4)',
      issueDate: review.signedOffAt ?? review.createdAt,
      organizationName,
      primaryColor,
    },
  });
}
