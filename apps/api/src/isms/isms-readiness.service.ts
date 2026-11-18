import { Injectable } from '@nestjs/common';
import { db } from '@db';
import { roleValidationMessages } from './documents/roles';
import { metricValidationMessages } from './documents/monitoring';
import { auditValidationMessages } from './documents/internal-audit';
import { loadRiskTreatmentReadinessMessages } from './documents/risk-treatment-readiness';
import {
  buildDocumentReadiness,
  type DocumentReadiness,
  type ReadinessFacts,
} from './documents/readiness-checks';
import { isMetricOverdue, periodStartFor, toPeriodKey } from './utils/metric-periods';

function hasContent(narrative: unknown): boolean {
  return (
    narrative != null &&
    typeof narrative === 'object' &&
    Object.keys(narrative).length > 0
  );
}

/**
 * Guided ISMS overview: a per-clause checklist of what is done and what is
 * missing, computed from the registers on every read (no stored state).
 */
@Injectable()
export class IsmsReadinessService {
  async getReadiness({
    organizationId,
    frameworkId,
    now = new Date(),
  }: {
    organizationId: string;
    frameworkId: string;
    now?: Date;
  }) {
    const documents = await db.ismsDocument.findMany({
      where: { organizationId, frameworkId },
      select: {
        id: true,
        type: true,
        status: true,
        draftNarrative: true,
        contextIssues: { select: { kind: true } },
        interestedParties: { select: { id: true } },
        interestedPartyRequirements: {
          select: { ownerMemberId: true, lastReviewedAt: true },
        },
        objectives: { select: { ownerMemberId: true, target: true } },
        roles: {
          select: {
            roleKey: true,
            name: true,
            auditRoute: true,
            auditRouteMemberId: true,
            auditFirmName: true,
            auditEvidenceRef: true,
            auditCourse: true,
            auditDueDate: true,
            assignments: { select: { memberId: true, acknowledgedAt: true } },
          },
        },
        metrics: {
          select: {
            name: true,
            cadence: true,
            isActive: true,
            createdAt: true,
            measurements: {
              orderBy: { periodStart: 'desc' },
              take: 1,
              select: { periodStart: true },
            },
          },
        },
        audits: {
          select: {
            reference: true,
            status: true,
            conclusionVerdict: true,
            plannedEndDate: true,
            updatedAt: true,
          },
        },
        reviews: {
          select: { status: true, meetingDate: true, updatedAt: true },
        },
      },
    });

    const needsRiskMessages = documents.some((doc) => doc.type === 'risk_treatment_plan');
    const [activeMembers, riskTreatmentMessages, openNonconformities] =
      await Promise.all([
        db.member.findMany({
          where: { organizationId, deactivated: false },
          select: { id: true },
        }),
        needsRiskMessages
          ? loadRiskTreatmentReadinessMessages({ organizationId })
          : Promise.resolve([]),
        db.ismsNonconformity.findMany({
          where: { organizationId, status: { not: 'closed' } },
          select: { dueDate: true },
        }),
      ]);
    const activeMemberIds = new Set(activeMembers.map((member) => member.id));

    const items: DocumentReadiness[] = documents.map((doc) => {
      const activeMetrics = doc.metrics.filter((m) => m.isActive && m.cadence);
      const facts: ReadinessFacts = {
        status: doc.status,
        hasNarrative: hasContent(doc.draftNarrative),
        internalIssues: doc.contextIssues.filter((i) => i.kind === 'internal').length,
        externalIssues: doc.contextIssues.filter((i) => i.kind === 'external').length,
        parties: doc.interestedParties.length,
        requirements: doc.interestedPartyRequirements,
        objectives: doc.objectives,
        roleMessages:
          doc.type === 'roles_and_responsibilities'
            ? roleValidationMessages({
                roles: doc.roles,
                memberCount: activeMemberIds.size,
                activeMemberIds,
              })
            : [],
        unacknowledgedAssignments: doc.roles
          .flatMap((role) => role.assignments)
          .filter((a) => activeMemberIds.has(a.memberId) && !a.acknowledgedAt).length,
        metricMessages:
          doc.type === 'monitoring' ? metricValidationMessages({ metrics: doc.metrics }) : [],
        overdueMetrics: activeMetrics.filter((metric) => {
          if (!metric.cadence) return false;
          const latest = metric.measurements[0];
          return isMetricOverdue({
            cadence: metric.cadence,
            latestMeasured: latest ? toPeriodKey(latest.periodStart) : null,
            anchor: periodStartFor(metric.cadence, metric.createdAt),
            now,
          });
        }).length,
        riskTreatmentMessages,
        completedAuditDates: doc.audits
          .filter((audit) => audit.status === 'complete')
          .map((audit) => audit.plannedEndDate ?? audit.updatedAt),
        auditMessages:
          doc.type === 'internal_audit' ? auditValidationMessages({ audits: doc.audits }) : [],
        completedReviewDates: doc.reviews
          .filter((review) => review.status === 'complete')
          .map((review) => review.meetingDate ?? review.updatedAt),
      };
      return buildDocumentReadiness({ type: doc.type, documentId: doc.id, facts, now });
    });

    const total = items.reduce((sum, item) => sum + item.checks.length, 0);
    const done = items.reduce(
      (sum, item) => sum + item.checks.filter((c) => c.done).length,
      0,
    );
    return {
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
      documents: items,
      nonconformities: {
        open: openNonconformities.length,
        overdue: openNonconformities.filter(
          (row) => row.dueDate && row.dueDate.getTime() < now.getTime(),
        ).length,
      },
    };
  }
}
