/** Shared fixtures for the framework evidence export specs (named *spec.ts so builds skip it). */
export const RISK_MANAGEMENT_TEMPLATE = 'frk_ct_683f484fc7b5506ab97c26af';

export function natives(overrides: Record<string, unknown> = {}) {
  return {
    isms: [
      {
        title: 'Risk Treatment Plan',
        fileName: 'Risk Treatment Plan v2.pdf',
        version: 2,
        requirementId: 'r3',
        controlIds: new Set<string>(),
        pdf: Buffer.from('isms'),
      },
    ],
    unpublishedIsms: ['ISMS Scope'],
    soa: null,
    registers: new Map([['risks', 'risk-csv']]),
    omittedRegisters: ['people'],
    soaOmitted: false,
    ...overrides,
  };
}

export const renderer = { renderPoliciesPdfBuffer: jest.fn(() => Buffer.from('policy-pdf')) };

export function approvedPolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pol_1',
    name: 'Information Security Policy',
    status: 'published',
    lastPublishedAt: new Date('2026-01-10T00:00:00Z'),
    reviewDate: new Date('2027-01-10T00:00:00Z'),
    frequency: 'yearly',
    visibility: 'ALL',
    visibleToDepartments: [],
    assignee: null,
    reviews: [],
    versions: [
      {
        version: 3,
        content: [{ type: 'paragraph' }],
        pdfUrl: null,
        approvedAt: new Date('2026-01-10T00:00:00Z'),
        approvedBy: { user: { name: 'Ada', email: 'ada@spare.test' } },
        publishedBy: null,
      },
    ],
    ...overrides,
  };
}

export function requirement(id: string, identifier: string, name: string) {
  return { id, identifier, name, description: '', frameworkId: 'frk_1', customFrameworkId: null, kind: 'platform' };
}

export function mapping(
  requirementId: string,
  links: { policyId?: string; taskId?: string; formType?: string; templateId?: string },
) {
  return {
    requirementId,
    customRequirementId: null,
    control: {
      id: `ctl_${requirementId}`,
      controlTemplateId: links.templateId ?? null,
      name: `Control ${links.policyId ?? ''}${links.taskId ?? ''}${links.formType ?? ''}`,
      frameworkPolicyLinks: links.policyId ? [{ policyId: links.policyId }] : [],
      frameworkTaskLinks: links.taskId ? [{ taskId: links.taskId }] : [],
      frameworkDocumentLinks: links.formType ? [{ formType: links.formType }] : [],
    },
  };
}
