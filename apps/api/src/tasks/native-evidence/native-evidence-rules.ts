import type { NativeEvidenceRule } from './native-evidence.types';
import { authenticationRule, employeeAccessRule } from './rules/access-security-rules';
import { accessReviewRule, supplierContractRule, supplierEvaluationRule } from './rules/access-vendor-rules';
import { asvScanRule, assetInventoryRule, cdeScopeRule, vulnerabilityRemediationRule } from './rules/asset-scan-rules';
import { secureDevicesRule } from './rules/device-chart-rules';
import { communicationPlanRule, correctiveActionRule, pciExecutiveRule, tabletopRule } from './rules/governance-rules';
import { internalAuditRule, riskTreatmentPlanRule } from './rules/isms-rules';
import { orgChartRule } from './rules/org-chart-rule';
import { employeeVerificationRule, securityTrainingRule } from './rules/people-rules';

/**
 * Task template ID → the native-state rule that can prove it. Same keying as
 * integration-platform `task-mappings.ts`.
 * shortcut: hard-coded per template; move to the framework editor only if
 * customers need to remap rules themselves.
 */
export const NATIVE_EVIDENCE_RULES: Record<string, NativeEvidenceRule> = {
  frk_tt_69eb875d77ef6407785a500f: riskTreatmentPlanRule, // Risk Analysis & Treatment Plan
  frk_tt_68e52b2618cb9d9722c6edfd: internalAuditRule, // Internal Security Audit
  frk_tt_68406951bd282273ebe286cc: employeeVerificationRule, // Employee Verification
  frk_tt_698cacc0f06de04786d097ca: securityTrainingRule, // Security Awareness Training
  // Assets is the single inventory (devices sync into it), so the Device List is proven there.
  frk_tt_68406903839203801ac8041a: assetInventoryRule, // Device List
  frk_tt_69033a6bfeb4759be36257bc: assetInventoryRule, // Infrastructure Inventory
  frk_tt_6840796f77d8a0dff53f947a: secureDevicesRule, // Secure Devices
  frk_tt_68e52b274a7c38c62db08e80: orgChartRule, // Organisation Chart
  frk_tt_68e805457c2dcc784e72e3cc: accessReviewRule, // Access Review Log
  frk_tt_691e56cccca43b5df5080439: supplierEvaluationRule, // Supplier Evaluation Records
  frk_tt_69efd9ed795877621cdbd56d: supplierContractRule, // Annual Service Provider and Contractor Contract Review
  frk_tt_69dd3f6094fc732d635210ae: cdeScopeRule, // Scope confirmation & CDE inventory pack
  frk_tt_0a031fa912c0a87587d39115: vulnerabilityRemediationRule, // Vulnerability Scan & Patch Remediation Report
  frk_tt_69dd400bdc718337e0354ff7: asvScanRule, // Passing ASV quarterly scan evidence
  frk_tt_691e6d9cb17ea23bfc68c57b: correctiveActionRule, // Corrective Action Reports
  frk_tt_68406ca292d9fffb264991b9: employeeAccessRule, // Employee Access
  frk_tt_68406cd9dde2d8cd4c463fe0: authenticationRule, // 2FA (MFA + idle timeout, PCI 8.2.8)
  frk_tt_69dd3f8f62639b078e7cc061: pciExecutiveRule, // Executive PCI accountability assignment
  frk_tt_68cc327ff5d3130a1b42420b: communicationPlanRule, // Management System Communication Plan
  frk_tt_69efd9f0124f63db79cb50b0: tabletopRule, // Annual Incident Response Tabletop Exercise
  frk_tt_69eb8760d56cb8d18c53df13: tabletopRule, // Contingency Plan Testing & Revision
};

export function ruleForTemplate(templateId: string | null): NativeEvidenceRule | null {
  return (templateId && NATIVE_EVIDENCE_RULES[templateId]) || null;
}
