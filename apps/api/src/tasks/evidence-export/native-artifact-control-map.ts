import type { RegisterKey } from './registers/registers';

/**
 * Which platform registers evidence a control, keyed by framework-editor control
 * template id (stable across organizations; seeded from the framework editor).
 * A requirement folder gets a register when any of its mapped controls was
 * created from one of these templates. ISO 27001:2022 / PCI DSS v4.0.1 targets
 * are noted per entry.
 */
export const REGISTERS_BY_CONTROL_TEMPLATE: Record<string, RegisterKey[]> = {
  // Risk Management: ISO 6.1.1-6.1.3, 8.2, 8.3; PCI 12.3.1
  frk_ct_683f484fc7b5506ab97c26af: ['risks', 'risk-acceptances'],
  // Supplier Security: ISO A.5.19-A.5.23; PCI 12.8.1-12.8.5
  frk_ct_683f48ee9534e1e0a088e922: ['vendors', 'risk-acceptances'],
  // Human Resources Security: ISO 7.2, 7.3, A.6.1-A.6.8
  frk_ct_69e639b958a20954c4afa186: ['people', 'offboarding'],
  // Personnel Security: ISO A.6.1, A.6.3; PCI 12.6.x, 12.7.1
  frk_ct_683f43a65de3b6044e63220f: ['people'],
  // Acceptable Use: ISO A.5.10, A.6.2; PCI 12.2.1 (policy acknowledgement)
  frk_ct_68407c9513000617776104c7: ['people'],
  // Policy Compliance: ISO 5.2, A.5.1 (policies acknowledged by personnel)
  frk_ct_683f3ecd42e62fde624c59c1: ['people'],
  // Access Rights: ISO A.5.15-A.5.18; PCI 7.2.x, 8.2.x (joiners, leavers)
  frk_ct_683f4a410cf5bf6d40bf3583: ['people', 'offboarding'],
  // Asset Return: ISO A.5.11; PCI 8.2.5
  frk_ct_684073617d0706858cceb8c7: ['offboarding', 'devices'],
  // Asset Inventory: ISO A.5.9, A.8.1; PCI 12.5.1
  frk_ct_683f42c71eea99f22f9df060: ['devices', 'assets'],
  // PCI DSS scope & CDE: PCI 12.5.2 (in-scope system list)
  frk_ct_69dd33a6d12ae294a95e9ac1: ['assets'],
  // Vulnerability Management: ISO A.8.8; PCI 6.3.1, 6.3.3, 11.3.1, 11.3.2.1, 11.4
  frk_ct_683f4d7360a876b972aba39a: ['vulnerabilities'],
  // Configuration & Patch Management: ISO A.8.8, A.8.9; PCI 6.3.3
  frk_ct_6840738800f98fa3c0f3a3ae: ['vulnerabilities'],
  // Endpoint Protection: ISO A.8.1, A.8.7; PCI 5.x
  frk_ct_684072e06f4a49ee669076cc: ['devices'],
  // Endpoint Security: PCI 5.2.x, 5.3.x
  frk_ct_68407406644c56d42eac3295: ['devices'],
  // Mobile Security: ISO A.8.1
  frk_ct_684070c1f0091d850df02e59: ['devices'],
  // Internal Audit & Management Review: ISO 9.2, 9.3, 10.1, 10.2
  frk_ct_69e639b96ad6c5e729676acb: ['findings'],
  // Independent ISMS Review: ISO A.5.35
  frk_ct_683f4f59dea367ca96145e14: ['findings'],
};

/** ISO 27001 clause whose folder also carries the Statement of Applicability. */
export const SOA_REQUIREMENT_IDENTIFIER = '6.1.3';

export function registersForControlTemplates(
  templateIds: Array<string | null>,
): RegisterKey[] {
  const keys = new Set<RegisterKey>();
  for (const id of templateIds) {
    if (!id) continue;
    for (const key of REGISTERS_BY_CONTROL_TEMPLATE[id] ?? []) keys.add(key);
  }
  return Array.from(keys);
}
