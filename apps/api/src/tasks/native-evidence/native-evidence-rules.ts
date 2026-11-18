import type { NativeEvidenceRule } from './native-evidence.types';
import { accessReviewRule, supplierEvaluationRule } from './rules/access-vendor-rules';
import { deviceListRule, orgChartRule, secureDevicesRule } from './rules/device-chart-rules';
import { internalAuditRule, riskTreatmentPlanRule } from './rules/isms-rules';
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
  frk_tt_68406903839203801ac8041a: deviceListRule, // Device List
  frk_tt_6840796f77d8a0dff53f947a: secureDevicesRule, // Secure Devices
  frk_tt_68e52b274a7c38c62db08e80: orgChartRule, // Organisation Chart
  frk_tt_68e805457c2dcc784e72e3cc: accessReviewRule, // Access Review Log
  frk_tt_691e56cccca43b5df5080439: supplierEvaluationRule, // Supplier Evaluation Records
};

export function ruleForTemplate(templateId: string | null): NativeEvidenceRule | null {
  return (templateId && NATIVE_EVIDENCE_RULES[templateId]) || null;
}
