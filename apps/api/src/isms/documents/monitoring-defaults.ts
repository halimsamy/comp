import type { SeedMetricDefinition } from './types';

/**
 * The seeded monitoring metrics (CS-723), active from day one. Names,
 * measured text, methods, cadences and targets follow the ticket and the
 * clause-9.1 reference document; the customer edits any field, deactivates a
 * metric, or adds custom ones. Seeding is idempotent by metricKey
 * (seedMetricsIfMissing) and never overwrites customer edits.
 */
export const SEED_METRIC_DEFINITIONS: SeedMetricDefinition[] = [
  {
    metricKey: 'training_completion',
    name: 'Security awareness training completion',
    whatIsMeasured:
      'Percentage of in-scope workforce members whose security-awareness and assigned role training is complete and not expired.',
    method:
      'Computed by Comp AI with the People training rule (the same one the Overview training card uses): members with complete, in-date training over all members who must train.',
    cadence: 'monthly',
    target: '95% completion or above',
  },
  {
    metricKey: 'vendor_review_currency',
    name: 'Vendor review currency',
    whatIsMeasured:
      'Percentage of vendors in periodic-review scope with an in-date security review.',
    method:
      'Computed by Comp AI with the Vendors review rule: non-archived vendors in review scope (critical or high criticality, PCI DSS 12.8 scope, or high inherent risk) whose review is not overdue or missing, over all vendors in scope.',
    cadence: 'quarterly',
    target: '100% of in-scope vendors current',
  },
  {
    metricKey: 'finding_ageing',
    name: 'Open audit findings and corrective-action ageing',
    whatIsMeasured:
      'Count of open nonconformities and auditor findings in the 10.2 register, and the age of each.',
    method:
      'Computed by Comp AI from the 10.2 nonconformity register (internal-audit nonconformities, auditor findings and standalone records; observations and OFIs are excluded): open items by days since raised, against their due date.',
    cadence: 'monthly',
    target: 'No corrective action open beyond its due date',
  },
  {
    metricKey: 'risk_treatment_status',
    name: 'Risk treatment status',
    whatIsMeasured:
      'Progress of risk treatment plans across the risk register.',
    method:
      'Comp AI risk register: risks by treatment status, highlighting high and critical risks without an active plan.',
    cadence: 'quarterly',
    target: 'All high and critical risks under active treatment',
  },
  {
    metricKey: 'policy_acknowledgement',
    name: 'Policy acknowledgement coverage',
    whatIsMeasured:
      'Percentage of workforce members who have acknowledged all policies assigned to them.',
    method:
      'Computed by Comp AI with the Overview acknowledgement rule: members who signed every published policy that requires sign-off and is visible to them (department-scoped policies count only for those departments), over all members with such policies.',
    cadence: 'quarterly',
    target: '95% acknowledgement coverage or above',
  },
  {
    metricKey: 'uptime',
    name: 'Production availability / uptime',
    whatIsMeasured: 'Availability of production services over the period.',
    method:
      'Cloud monitoring uptime reports (e.g. AWS / GCP / status page) for production services.',
    cadence: 'monthly',
    target: '99.9% availability or above',
  },
  {
    metricKey: 'vulnerability_remediation',
    name: 'Critical and High vulnerabilities remediated within SLA',
    whatIsMeasured:
      'Time from detection to remediation for Critical and High severity vulnerabilities.',
    method:
      'Computed by Comp AI from the Vulnerabilities register: share of Critical and High vulnerabilities closed by their remediation SLA due date (open ones past due count as missed).',
    cadence: 'monthly',
    target: '100% within SLA (PCI DSS 6.3.3: critical within one month)',
  },
  {
    metricKey: 'unauthorised_access',
    name: 'Confirmed unauthorised-access incidents',
    whatIsMeasured:
      'Confirmed incidents of unauthorised access to customer or company data.',
    method:
      'Access logs, alerting and incident records: count of confirmed unauthorised-access incidents in the period.',
    cadence: 'monthly',
    target: '0 confirmed incidents',
  },
  {
    metricKey: 'incident_response_times',
    name: 'Incident time-to-acknowledge and time-to-contain',
    whatIsMeasured:
      'Time from detection to acknowledgement and to containment for security incidents.',
    method:
      'Incident records measured against the severity SLA: acknowledgement and containment timestamps per incident.',
    cadence: 'monthly',
    target: 'Within the severity SLA for every incident',
  },
  {
    metricKey: 'task_on_time',
    name: 'Evidence task on-time rate',
    whatIsMeasured:
      'Percentage of recurring evidence tasks completed within their due date.',
    method:
      'Comp AI task tracker: recurring tasks not past their next due date, over all recurring tasks in scope.',
    cadence: 'monthly',
    target: '90% of recurring tasks on time or above',
  },
];

/** Stable keys of the seeded metrics. */
export const SEED_METRIC_KEYS: string[] = SEED_METRIC_DEFINITIONS.map(
  (metric) => metric.metricKey,
);
