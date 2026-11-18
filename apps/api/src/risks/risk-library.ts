import type { Impact, Likelihood, RiskCategory } from '@db';

export interface RiskLibraryTemplate {
  id: string;
  group: string;
  title: string;
  description: string;
  category: RiskCategory;
  likelihood: Likelihood;
  impact: Impact;
  /** Suggested mitigation plan, stored as the risk's treatment description. */
  treatment: string;
  /** Framework references shown in the library (ISO 27001:2022 Annex A / PCI DSS v4.0.1). */
  references: string[];
}

type Entry = Omit<RiskLibraryTemplate, 'id' | 'group'>;

// shortcut: static catalog in code; move to a framework-editor template table
// when the library needs per-framework editing outside a deploy.
const GROUPS: Record<string, Record<string, Entry>> = {
  'Cardholder data': {
    'pan-exposure': {
      title: 'Cardholder data exposed outside the CDE',
      description: 'Primary account numbers (PAN) are stored, logged or transmitted in clear text outside the cardholder data environment, e.g. in application logs, support tickets, analytics or backups.',
      category: 'technology', likelihood: 'possible', impact: 'severe',
      treatment: 'Run data discovery for PAN outside the CDE every quarter, mask PAN in logs and tickets, tokenize or truncate stored PAN, and keep the data-retention purge job monitored.',
      references: ['PCI DSS 3.2.1', 'PCI DSS 3.4.1', 'PCI DSS 3.5.1', 'PCI DSS 12.5.2', 'ISO A.8.11', 'ISO A.8.12'],
    },
    'key-compromise': {
      title: 'Cryptographic key compromise',
      description: 'Keys that protect stored account data or payment traffic are exposed, weak or not rotated, letting an attacker decrypt cardholder data.',
      category: 'technology', likelihood: 'unlikely', impact: 'severe',
      treatment: 'Keep keys in a KMS/HSM with split knowledge and dual control, restrict key custodians, rotate at the end of the cryptoperiod and keep the cryptographic inventory current.',
      references: ['PCI DSS 3.6.1', 'PCI DSS 3.7.1', 'PCI DSS 3.7.4', 'ISO A.8.24'],
    },
    'cde-segmentation': {
      title: 'CDE segmentation failure',
      description: 'Network segmentation that isolates the cardholder data environment stops working after a change, pulling out-of-scope systems into PCI scope or exposing the CDE.',
      category: 'technology', likelihood: 'possible', impact: 'major',
      treatment: 'Review firewall and security-group rules every six months, run segmentation penetration tests every six months (service provider), and gate network changes through change management.',
      references: ['PCI DSS 1.2.7', 'PCI DSS 11.4.5', 'PCI DSS 11.4.6', 'ISO A.8.22'],
    },
  },
  'Payments & fraud': {
    'payment-page-skimming': {
      title: 'Payment page script tampering (e-skimming)',
      description: 'A malicious or modified script on the payment page captures card data as customers type it (Magecart-style attack).',
      category: 'technology', likelihood: 'possible', impact: 'severe',
      treatment: 'Inventory and authorize every payment-page script with integrity checks, deploy CSP, and run a change- and tamper-detection mechanism at least weekly.',
      references: ['PCI DSS 6.4.3', 'PCI DSS 11.6.1', 'ISO A.8.28'],
    },
    'card-fraud': {
      title: 'Card-not-present and account takeover fraud',
      description: 'Fraudsters use stolen cards or taken-over customer accounts to move money, causing chargebacks, losses and scheme penalties.',
      category: 'fraud', likelihood: 'likely', impact: 'major',
      treatment: 'Apply 3-D Secure and velocity rules, monitor transactions for anomalies, enforce MFA and device binding on customer accounts, and review fraud KPIs monthly.',
      references: ['ISO A.5.7', 'ISO A.8.16'],
    },
    'insider-fraud': {
      title: 'Insider misuse of payment operations',
      description: 'An employee with privileged access to payouts, refunds or ledgers misuses it for personal gain or bypasses approvals.',
      category: 'fraud', likelihood: 'unlikely', impact: 'major',
      treatment: 'Enforce segregation of duties and four-eyes approval on payouts and refunds, log all privileged actions, and review privileged access every six months.',
      references: ['ISO A.5.3', 'ISO A.8.2', 'PCI DSS 7.2.4', 'PCI DSS 10.2.1'],
    },
  },
  'Third parties': {
    'tpsp-compromise': {
      title: 'Third-party service provider compromise',
      description: 'A provider that stores, processes or can affect cardholder data or production systems (processor, cloud, support tool) suffers a breach or loses its compliance.',
      category: 'vendor_management', likelihood: 'possible', impact: 'major',
      treatment: 'Keep the TPSP list current, hold written responsibility agreements, review each provider\'s AOC or SOC 2 every year and track expiry dates.',
      references: ['PCI DSS 12.8.1', 'PCI DSS 12.8.4', 'PCI DSS 12.8.5', 'ISO A.5.19', 'ISO A.5.22'],
    },
    'cloud-outage': {
      title: 'Cloud provider regional outage',
      description: 'A regional failure at the cloud provider takes the payment platform offline beyond its recovery objectives.',
      category: 'resilience', likelihood: 'unlikely', impact: 'major',
      treatment: 'Deploy across availability zones, test backups and restore, document RTO/RPO and run the business continuity exercise every year.',
      references: ['ISO A.5.30', 'ISO A.8.13', 'ISO A.8.14'],
    },
  },
  'Access & identity': {
    'credential-compromise': {
      title: 'Compromise of privileged credentials',
      description: 'An administrator or engineer account is phished or its credentials leak, giving an attacker access to production or the CDE.',
      category: 'technology', likelihood: 'possible', impact: 'severe',
      treatment: 'Require phishing-resistant MFA for all access into the CDE and admin consoles, remove shared accounts, and review access rights every six months.',
      references: ['PCI DSS 8.4.2', 'PCI DSS 8.2.2', 'PCI DSS 7.2.4', 'ISO A.5.17', 'ISO A.8.5'],
    },
    'leaver-access': {
      title: 'Leavers keep access after offboarding',
      description: 'Accounts of terminated staff or contractors stay active in SaaS tools, cloud consoles or VPN.',
      category: 'people', likelihood: 'possible', impact: 'moderate',
      treatment: 'Run the offboarding checklist the same day, revoke access in every connected system, and reconcile accounts against the HR list every quarter.',
      references: ['PCI DSS 8.2.5', 'ISO A.5.18', 'ISO A.6.5'],
    },
  },
  Technology: {
    'unpatched-vulns': {
      title: 'Critical vulnerabilities left unpatched',
      description: 'Critical or high vulnerabilities in internet-facing or CDE systems are not fixed within the required timeframe.',
      category: 'technology', likelihood: 'likely', impact: 'major',
      treatment: 'Scan internally and externally every quarter (ASV for external), patch critical issues within one month, and track exceptions with a targeted risk analysis.',
      references: ['PCI DSS 6.3.3', 'PCI DSS 11.3.1', 'PCI DSS 11.3.2', 'ISO A.8.8'],
    },
    'insecure-code': {
      title: 'Exploitable flaw in custom payment code',
      description: 'A coding flaw (injection, broken access control, insecure dependency) in bespoke software is shipped to production.',
      category: 'technology', likelihood: 'possible', impact: 'major',
      treatment: 'Train developers in secure coding every year, review code before release, scan dependencies and keep the SBOM, and run penetration tests every year.',
      references: ['PCI DSS 6.2.2', 'PCI DSS 6.2.4', 'PCI DSS 6.3.2', 'PCI DSS 11.4.1', 'ISO A.8.25', 'ISO A.8.28'],
    },
    'logging-gaps': {
      title: 'Security events missed due to logging gaps',
      description: 'Audit logs are incomplete, not reviewed daily or not kept for 12 months, so an intrusion goes unnoticed.',
      category: 'technology', likelihood: 'possible', impact: 'major',
      treatment: 'Centralize logs from CDE and critical systems, review them daily with automated alerting, and retain them for at least 12 months (3 months immediately available).',
      references: ['PCI DSS 10.2.1', 'PCI DSS 10.4.1', 'PCI DSS 10.5.1', 'ISO A.8.15', 'ISO A.8.16'],
    },
    ransomware: {
      title: 'Ransomware or destructive malware',
      description: 'Malware encrypts or destroys production data, laptops or backups.',
      category: 'technology', likelihood: 'possible', impact: 'severe',
      treatment: 'Run anti-malware or EDR on all endpoints, keep immutable off-site backups, test restores, and rehearse the incident response plan every year.',
      references: ['PCI DSS 5.2.1', 'PCI DSS 12.10.2', 'ISO A.8.7', 'ISO A.8.13'],
    },
  },
  'People & governance': {
    'phishing-staff': {
      title: 'Staff fall for phishing or social engineering',
      description: 'Employees disclose credentials or approve fraudulent payments after phishing or pretexting.',
      category: 'people', likelihood: 'likely', impact: 'moderate',
      treatment: 'Give security awareness training on hire and every year with phishing content, run phishing simulations, and verify payment-change requests out of band.',
      references: ['PCI DSS 12.6.1', 'PCI DSS 12.6.3.1', 'ISO A.6.3'],
    },
    'regulatory-breach': {
      title: 'Non-compliance with payment and data protection regulation',
      description: 'The company breaches PCI DSS, scheme rules or data protection law, leading to fines, loss of acquiring or licence conditions.',
      category: 'regulatory', likelihood: 'unlikely', impact: 'severe',
      treatment: 'Keep the legal and regulatory register current, confirm PCI DSS scope every six months, and report compliance status to management at the management review.',
      references: ['PCI DSS 12.4.1', 'PCI DSS 12.5.2.1', 'ISO A.5.31', 'ISO A.5.34'],
    },
    'incident-response': {
      title: 'Slow or uncoordinated incident response',
      description: 'A security incident is detected late or handled without a plan, missing scheme and regulator notification deadlines.',
      category: 'operations', likelihood: 'possible', impact: 'major',
      treatment: 'Maintain the incident response plan with card-brand notification steps, keep the on-call roster, and test the plan every year.',
      references: ['PCI DSS 12.10.1', 'PCI DSS 12.10.2', 'ISO A.5.24', 'ISO A.5.26'],
    },
  },
};

export const RISK_LIBRARY: RiskLibraryTemplate[] = Object.entries(GROUPS).flatMap(
  ([group, entries]) =>
    Object.entries(entries).map(([id, entry]) => ({ id, group, ...entry })),
);

export function findRiskTemplate(id: string): RiskLibraryTemplate | undefined {
  return RISK_LIBRARY.find((template) => template.id === id);
}
