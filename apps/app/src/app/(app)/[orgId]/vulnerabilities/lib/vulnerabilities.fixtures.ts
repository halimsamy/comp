import type { Vulnerability } from '@/hooks/use-vulnerabilities';

export function makeVulnerability(over: Partial<Vulnerability> = {}): Vulnerability {
  return {
    id: 'ipf_1',
    title: '3 unresolved Dependabot alerts on api',
    description: null,
    remediation: null,
    severity: 'critical',
    status: 'open',
    statusNote: null,
    source: 'integration',
    cveId: null,
    resourceType: 'repository',
    resourceId: 'acme/api',
    firstSeenAt: '2026-10-01T00:00:00.000Z',
    lastSeenAt: '2026-11-18T00:00:00.000Z',
    resolvedAt: null,
    slaDueAt: '2026-10-31T00:00:00.000Z',
    slaStatus: 'overdue',
    provider: { slug: 'github', name: 'GitHub' },
    asset: {
      id: 'ast_1',
      name: 'acme/api',
      type: 'repository',
      cdeScope: 'in_scope',
      environment: 'production',
    },
    owner: null,
    ...over,
  };
}

export const VULNERABILITIES: Vulnerability[] = [
  makeVulnerability(),
  makeVulnerability({
    id: 'ipf_2',
    title: 'OpenSSL overflow',
    severity: 'medium',
    source: 'asv_scan',
    cveId: 'CVE-2024-1234',
    provider: null,
    asset: null,
    resourceId: '10.0.0.5:443',
    slaStatus: 'due_later',
    slaDueAt: '2027-01-30T00:00:00.000Z',
  }),
  makeVulnerability({
    id: 'ipf_3',
    title: 'Old finding',
    status: 'resolved',
    slaStatus: 'closed',
    resolvedAt: '2026-11-02T00:00:00.000Z',
  }),
  makeVulnerability({
    id: 'ipf_4',
    title: 'Accepted',
    status: 'ignored',
    slaStatus: 'closed',
    statusNote: 'False positive',
  }),
];
