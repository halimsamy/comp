import { db } from '@db';
import {
  fingerprintOf,
  formatDate,
  monthsBefore,
  type NativeEvidenceRule,
} from '../native-evidence.types';

const VERDICT_LABEL: Record<string, string> = {
  conform: 'Conforms',
  substantially_conform: 'Substantially conforms (nonconformities recorded)',
  not_yet_conform: 'Does not yet conform',
};

/** ISO 27001 6.1.3: a published risk treatment plan, reviewed at least yearly. */
export const riskTreatmentPlanRule: NativeEvidenceRule = {
  key: 'isms_risk_treatment_plan',
  module: 'ISMS',
  title: 'Risk treatment plan (6.1.3) published within the last 12 months',
  reference: 'ISO/IEC 27001:2022 6.1.3, 8.3',
  path: '/documents/isms/risk-treatment-plan',
  async evaluate({ organizationId, now }) {
    const docs = await db.ismsDocument.findMany({
      where: { organizationId, type: 'risk_treatment_plan' },
      select: {
        title: true,
        currentVersion: {
          select: {
            id: true,
            version: true,
            publishedAt: true,
            changelog: true,
            publishedBy: { select: { user: { select: { name: true, email: true } } } },
          },
        },
      },
    });
    const latest = docs
      .flatMap((d) =>
        d.currentVersion?.publishedAt
          ? [{ title: d.title, version: d.currentVersion, publishedAt: d.currentVersion.publishedAt }]
          : [],
      )
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())[0];
    const publishedAt = latest?.publishedAt ?? null;
    const holds = !!publishedAt && publishedAt >= monthsBefore({ date: now, months: 12 });
    const publisher = latest?.version.publishedBy?.user;
    return {
      holds,
      summary: latest
        ? `Version ${latest.version.version} published ${formatDate(latest.publishedAt)}`
        : 'No published risk treatment plan',
      issues: holds
        ? []
        : [
            publishedAt
              ? 'The published plan is older than 12 months. Review and publish a new version.'
              : 'Generate and publish the risk treatment plan in ISMS.',
          ],
      fingerprint: fingerprintOf(['rtp', latest?.version.id ?? null]),
      sections: [
        {
          heading: 'Risk treatment plan',
          keyValues: [
            { label: 'Document', value: latest?.title ?? 'Risk treatment plan' },
            { label: 'Published version', value: latest ? `v${latest.version.version}` : '—' },
            { label: 'Published on', value: formatDate(publishedAt) },
            { label: 'Approved by', value: publisher ? publisher.name || publisher.email : '—' },
            { label: 'Change note', value: latest?.version.changelog || '—' },
          ],
        },
      ],
    };
  },
};

/** ISO 27001 9.2: an internal audit completed and signed off within 12 months. */
export const internalAuditRule: NativeEvidenceRule = {
  key: 'isms_internal_audit',
  module: 'ISMS',
  title: 'Internal audit (9.2) completed and signed off within the last 12 months',
  reference: 'ISO/IEC 27001:2022 9.2.1, 9.2.2',
  path: '/documents/isms/internal-audit',
  async evaluate({ organizationId, now }) {
    const since = monthsBefore({ date: now, months: 12 });
    const audits = await db.ismsAudit.findMany({
      where: { document: { organizationId, type: 'internal_audit' } },
      orderBy: { updatedAt: 'desc' },
      include: { findings: { select: { type: true, status: true } } },
    });
    // Signed = complete, and both the auditor and top management signed (name + date).
    const signedAt = (a: (typeof audits)[number]) =>
      a.status === 'complete' &&
      a.signoffAuditorName &&
      a.signoffAuditorDate &&
      a.signoffTopMgmtName &&
      a.signoffTopMgmtDate
        ? new Date(Math.max(a.signoffAuditorDate.getTime(), a.signoffTopMgmtDate.getTime()))
        : null;
    const signed = audits
      .map((a) => ({ audit: a, at: signedAt(a) }))
      .filter((x): x is { audit: (typeof audits)[number]; at: Date } => x.at !== null)
      .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    const holds = !!signed && signed.at >= since;
    const audit = signed?.audit ?? audits[0];
    const openFindings = audit?.findings.filter((f) => f.status !== 'closed').length ?? 0;

    return {
      holds,
      summary: signed
        ? `${signed.audit.reference} signed off ${formatDate(signed.at)}`
        : audits.length
          ? `${audits[0].reference} is ${audits[0].status.replace('_', ' ')}, not signed off`
          : 'No internal audit recorded',
      issues: holds
        ? []
        : [
            signed
              ? 'The last signed audit is older than 12 months. Plan and complete this year’s audit.'
              : 'Complete the audit and record the auditor and top management sign-off.',
          ],
      fingerprint: fingerprintOf(['audit', signed?.audit.id ?? null, signed?.at ?? null]),
      sections: audit
        ? [
            {
              heading: `Internal audit ${audit.reference}`,
              keyValues: [
                { label: 'Scope', value: audit.scope },
                { label: 'Criteria', value: audit.criteria },
                { label: 'Auditor', value: audit.auditorName ?? '—' },
                {
                  label: 'Audit dates',
                  value: `${formatDate(audit.plannedStartDate)} to ${formatDate(audit.plannedEndDate)}`,
                },
                { label: 'Conclusion', value: audit.conclusionVerdict ? VERDICT_LABEL[audit.conclusionVerdict] : '—' },
                { label: 'Findings', value: `${audit.findings.length} raised, ${openFindings} still open` },
              ],
            },
            {
              heading: 'Sign-off',
              table: {
                headers: ['Role', 'Name', 'Date'],
                rows: [
                  ['Auditor', audit.signoffAuditorName ?? '—', formatDate(audit.signoffAuditorDate)],
                  ['Security programme owner', audit.signoffSpoName ?? '—', formatDate(audit.signoffSpoDate)],
                  ['Top management', audit.signoffTopMgmtName ?? '—', formatDate(audit.signoffTopMgmtDate)],
                ],
              },
            },
          ]
        : [{ heading: 'Internal audit', emptyText: 'No internal audit recorded.' }],
    };
  },
};
