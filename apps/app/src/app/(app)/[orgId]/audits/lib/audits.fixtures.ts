import type { Audit, AuditRequirement } from '@/hooks/use-audits';

export const AUDIT: Audit = {
  id: 'aud_1',
  title: 'ISO 27001 surveillance 2026',
  firmName: 'Acme Certification',
  status: 'in_progress',
  periodStart: '2026-01-01T00:00:00.000Z',
  periodEnd: '2026-12-31T23:59:59.999Z',
  accessEndsAt: '2027-02-28T23:59:59.999Z',
  pendingAuditorEmails: [],
  createdAt: '2026-11-01T00:00:00.000Z',
  frameworkInstanceId: 'frm_1',
  frameworkName: 'ISO 27001',
  auditors: [{ memberId: 'mem_aud', name: 'Ann Auditor', email: 'ann@cb.com', image: null }],
  progress: { total: 3, accepted: 1, flagged: 1, requested: 0, notReviewed: 1 },
  openRequests: 1,
  viewerIsAuditor: false,
};

export const REQUIREMENT: AuditRequirement = {
  id: 'req_1',
  identifier: 'A.5.15',
  name: 'Access control',
  description: 'Rules to control access are established.',
  controls: ['Access control policy'],
  tasks: [{ id: 'tsk_1', title: 'Quarterly access review', status: 'done', filesInPeriod: 2, needsUpdate: true }],
  policies: [{ id: 'pol_1', name: 'Access Control Policy', status: 'published' }],
  documents: [],
  readiness: 'needs_update',
  blockedBy: ['Quarterly access review (evidence expired)'],
  review: null,
  commentCount: 0,
  openRequestCount: 0,
};
