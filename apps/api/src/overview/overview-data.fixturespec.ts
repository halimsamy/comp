import type { OverviewData } from './overview-data';

/** An org with nothing in it; specs override the modules they exercise. */
export function emptyOverviewData(
  overrides: Partial<OverviewData> = {},
): OverviewData {
  return {
    tasks: [],
    taskProgress: { total: 0, done: 0, notRelevant: 0 },
    policies: [],
    members: [],
    vendors: [],
    checkRuns: [],
    accessReviews: [],
    hasPciDss: false,
    training: { inScope: 0, trained: 0, expired: 0, neverTrained: 0, members: [] },
    people: [],
    risks: [],
    riskActions: [],
    riskRegisterReviewDue: null,
    acceptanceThreshold: 'medium',
    assets: [],
    vulnerabilities: [],
    scanCadence: [],
    hasScans: false,
    nonconformities: [],
    nonconformitiesTotal: 0,
    reviewActions: [],
    ismsDocuments: [],
    questionnaires: [],
    auditRequests: [],
    overduePhases: [],
    forms: [],
    ...overrides,
  };
}
