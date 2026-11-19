import { ISO27001_FRAMEWORK_NAMES } from '../../soa/utils/constants';
import type { ApplicabilityStatus } from '../scoring/framework-scoring';
import { isCustomizedApproachEligible } from './applicability-details';

export interface ApplicabilityRules {
  editable: boolean;
  allowedStatuses: ApplicabilityStatus[];
  /** 'soa' when the ISO 27001 Statement of Applicability owns the decision. */
  managedBy: 'soa' | null;
  reason: string | null;
}

export const isIsoFramework = (name: string | null | undefined) =>
  !!name && ISO27001_FRAMEWORK_NAMES.includes(name);

const isPciFramework = (name: string | null | undefined) => !!name && /pci/i.test(name);

/**
 * What a requirement's applicability may be set to.
 * - ISO 27001: clauses 4–10 can never be excluded (clause 1); Annex A
 *   applicability lives in the Statement of Applicability (6.1.3 d), so an
 *   edit on the requirement page is written to the SoA.
 * - PCI DSS: N/A, compensating controls (Appendix B/C) or the customized
 *   approach (Appendix D/E, not for requirements without a customized
 *   approach objective), each with a justification for the ROC.
 */
export function applicabilityRules({
  frameworkName,
  requirementIdentifier,
}: {
  frameworkName: string | null | undefined;
  requirementIdentifier: string | null | undefined;
}): ApplicabilityRules {
  if (isIsoFramework(frameworkName)) {
    if ((requirementIdentifier ?? '').startsWith('A.')) {
      return {
        editable: true,
        allowedStatuses: ['applicable', 'not_applicable'],
        managedBy: 'soa',
        reason: 'Saved to the Statement of Applicability, the source of truth for Annex A.',
      };
    }
    return {
      editable: false,
      allowedStatuses: ['applicable'],
      managedBy: null,
      reason: 'ISO 27001 clauses 4–10 are mandatory and cannot be excluded.',
    };
  }
  if (isPciFramework(frameworkName)) {
    return {
      editable: true,
      allowedStatuses: isCustomizedApproachEligible(requirementIdentifier)
        ? ['applicable', 'not_applicable', 'compensating_control', 'customized_approach']
        : ['applicable', 'not_applicable', 'compensating_control'],
      managedBy: null,
      reason: isCustomizedApproachEligible(requirementIdentifier)
        ? null
        : 'PCI DSS has no customized approach objective for this requirement.',
    };
  }
  return {
    editable: true,
    allowedStatuses: ['applicable', 'not_applicable'],
    managedBy: null,
    reason: null,
  };
}
