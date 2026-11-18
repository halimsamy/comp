import { db, type Impact, type Likelihood } from '@db';
import {
  humanize,
  personName,
  rating,
  toCsv,
  type RegisterParams,
} from './register-csv';

type Acceptance = {
  createdAt: Date;
  acceptedByName: string;
  notes: string | null;
  residualLikelihood: Likelihood;
  residualImpact: Impact;
};

/** An acceptance goes stale the moment the residual rating changes. */
function acceptanceState({
  acceptance,
  residualLikelihood,
  residualImpact,
}: {
  acceptance: Acceptance | undefined;
  residualLikelihood: Likelihood;
  residualImpact: Impact;
}): string {
  if (!acceptance) return 'Not accepted';
  const current =
    acceptance.residualLikelihood === residualLikelihood &&
    acceptance.residualImpact === residualImpact;
  return current ? 'Accepted' : 'Stale (residual rating changed)';
}

const latestAcceptance = {
  orderBy: { createdAt: 'desc' as const },
  take: 1,
  select: {
    createdAt: true,
    acceptedByName: true,
    notes: true,
    residualLikelihood: true,
    residualImpact: true,
  },
};

/** Risk register (ISO 27001 6.1.2 / 6.1.3, PCI DSS 12.3.1): one row per risk. */
export async function buildRiskRegisterCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const risks = await db.risk.findMany({
    where: { organizationId },
    include: {
      assignee: { select: { user: { select: { name: true, email: true } } } },
      acceptances: latestAcceptance,
      tasks: { select: { title: true, status: true }, orderBy: { title: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return toCsv({
    headers: [
      'Risk ID',
      'Title',
      'Description',
      'Category',
      'Department',
      'Status',
      'Owner',
      'Owner email',
      'Inherent likelihood',
      'Inherent impact',
      'Inherent score',
      'Inherent level',
      'Treatment',
      'Treatment plan',
      'Treatment tasks',
      'Residual likelihood',
      'Residual impact',
      'Residual score',
      'Residual level',
      'Acceptance',
      'Accepted by',
      'Accepted on',
      'Acceptance notes',
      'Created',
      'Last updated',
    ],
    rows: risks.map((risk) => {
      const inherent = rating(risk.likelihood, risk.impact);
      const residual = rating(risk.residualLikelihood, risk.residualImpact);
      const acceptance = risk.acceptances[0];
      return [
        risk.id,
        risk.title,
        risk.description,
        humanize(risk.category),
        humanize(risk.department),
        humanize(risk.status),
        personName(risk.assignee?.user),
        risk.assignee?.user.email,
        humanize(risk.likelihood),
        humanize(risk.impact),
        inherent.score,
        inherent.level,
        humanize(risk.treatmentStrategy),
        risk.treatmentStrategyDescription,
        // 6.1.3 / 8.3: the controls (tasks) implementing the treatment and their state.
        risk.tasks.map((t) => `${t.title} (${humanize(t.status)})`).join('; '),
        humanize(risk.residualLikelihood),
        humanize(risk.residualImpact),
        residual.score,
        residual.level,
        acceptanceState({
          acceptance,
          residualLikelihood: risk.residualLikelihood,
          residualImpact: risk.residualImpact,
        }),
        acceptance?.acceptedByName,
        acceptance?.createdAt,
        acceptance?.notes,
        risk.createdAt,
        risk.updatedAt,
      ];
    }),
  });
}

/** Every residual-risk acceptance event (ISO 27001 6.1.3 f), risks and vendors. */
export async function buildRiskAcceptancesCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const acceptances = await db.riskAcceptance.findMany({
    where: { organizationId },
    include: {
      risk: {
        select: { title: true, residualLikelihood: true, residualImpact: true },
      },
      vendor: {
        select: { name: true, residualProbability: true, residualImpact: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return toCsv({
    headers: [
      'Acceptance ID',
      'Subject type',
      'Subject',
      'Accepted by',
      'Accepted on',
      'Residual likelihood at acceptance',
      'Residual impact at acceptance',
      'Residual level at acceptance',
      'Notes',
      'Still current',
    ],
    rows: acceptances.map((a) => {
      const live = a.risk
        ? {
            likelihood: a.risk.residualLikelihood,
            impact: a.risk.residualImpact,
          }
        : a.vendor
          ? {
              likelihood: a.vendor.residualProbability,
              impact: a.vendor.residualImpact,
            }
          : null;
      const current =
        live !== null &&
        live.likelihood === a.residualLikelihood &&
        live.impact === a.residualImpact;
      return [
        a.id,
        a.risk ? 'Risk' : 'Vendor',
        a.risk?.title ?? a.vendor?.name,
        a.acceptedByName,
        a.createdAt,
        humanize(a.residualLikelihood),
        humanize(a.residualImpact),
        rating(a.residualLikelihood, a.residualImpact).level,
        a.notes,
        current,
      ];
    }),
  });
}

export { acceptanceState, latestAcceptance };
