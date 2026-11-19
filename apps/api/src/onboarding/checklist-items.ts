import {
  assetsScopedSpec,
  controlOwnersSpec,
  idleTimeoutSpec,
  vendorsClassifiedSpec,
} from './checklist-items-extra';
import type { ChecklistState } from './checklist-types';

export interface ChecklistItemSpec {
  id: string;
  section: string;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  references: string[];
  done: boolean;
  dependsOn?: string[];
  /** Extra lock that is not another item, e.g. "no risks yet". */
  lockedReason?: string | null;
  progress?: { done: number; total: number } | null;
}

const ratio = (done: number, total: number) => ({ done, total });
/** Opens the integrations catalogue filtered to one provider category. */
const integrations = (category: string) =>
  `/integrations?category=${encodeURIComponent(category)}`;

export function buildItemSpecs(s: ChecklistState): ChecklistItemSpec[] {
  const has = (category: string) => s.connectedCategories.includes(category);
  const specs: ChecklistItemSpec[] = [
    {
      id: 'frameworks',
      section: 'program',
      title: 'Add your frameworks',
      description:
        'Activate ISO 27001 and PCI DSS so CompAI maps controls, policies and evidence to every requirement.',
      href: '/frameworks',
      ctaLabel: 'Go to frameworks',
      references: [],
      done: s.frameworkCount > 0,
    },
    {
      id: 'company_profile',
      section: 'program',
      title: 'Add your company logo and website',
      description:
        'They appear on exported policies, ISMS documents and the trust portal.',
      href: '/settings',
      ctaLabel: 'Open settings',
      references: [],
      done: s.hasLogo && s.hasWebsite,
    },
    idleTimeoutSpec(s),
    controlOwnersSpec(s),
    ...(s.hasIso27001
      ? [
          {
            id: 'isms_profile',
            section: 'program',
            title: 'Complete the ISMS setup wizard',
            description:
              'Answer a few questions about your context, scope and leadership. CompAI drafts the ISMS documents from them.',
            href: '/documents/isms/wizard',
            ctaLabel: 'Start the wizard',
            references: ['ISO 27001 4.1', 'ISO 27001 4.2', 'ISO 27001 4.3'],
            done: s.ismsProfileCompleted,
          },
        ]
      : []),
    {
      id: 'identity_provider',
      section: 'systems',
      title: 'Connect your identity provider or HR system',
      description:
        'Syncs your people, detects joiners and leavers, and checks MFA and access automatically.',
      href: integrations('Identity & Access'),
      ctaLabel: 'Connect',
      references: ['ISO 27001 A.5.16', 'ISO 27001 A.5.18', 'PCI DSS 8.2.1'],
      done: has('Identity & Access') || has('HR & People'),
    },
    {
      id: 'cloud_provider',
      section: 'systems',
      title: 'Connect your cloud provider',
      description:
        'Runs configuration tests against AWS, GCP or Azure and feeds the results into your evidence tasks.',
      href: integrations('Cloud'),
      ctaLabel: 'Connect',
      references: ['ISO 27001 A.8.9', 'PCI DSS 2.2.1'],
      done: has('Cloud') || s.hasLegacyCloudIntegration,
    },
    {
      id: 'version_control',
      section: 'systems',
      title: 'Connect version control',
      description:
        'Checks branch protection and code review on your repositories.',
      href: integrations('Development'),
      ctaLabel: 'Connect',
      references: ['ISO 27001 A.8.28', 'PCI DSS 6.2.3'],
      done: has('Development'),
    },
    {
      id: 'policies_published',
      section: 'policies',
      title: 'Review and publish your policies',
      description:
        'Approve each policy so it becomes the live version employees accept.',
      href: s.policies.firstUnpublishedId
        ? `/policies/${s.policies.firstUnpublishedId}`
        : '/policies',
      ctaLabel: s.policies.firstUnpublishedId
        ? 'Go to next policy'
        : 'Go to policies',
      references: ['ISO 27001 A.5.1', 'PCI DSS 12.1.1'],
      done: s.policies.total > 0 && s.policies.published === s.policies.total,
      progress: ratio(s.policies.published, s.policies.total),
    },
    {
      id: 'policies_acknowledged',
      section: 'policies',
      title: 'Get employees to accept policies',
      description:
        'Employees accept published policies in the portal. PCI DSS asks for this at least every 12 months.',
      href: '/people',
      ctaLabel: 'View people',
      references: ['ISO 27001 7.3', 'PCI DSS 12.6.3'],
      done:
        s.acknowledgements.members > 0 &&
        s.acknowledgements.fullySigned === s.acknowledgements.members,
      lockedReason:
        s.policies.published === 0
          ? 'Publish at least one policy first.'
          : null,
      progress: ratio(
        s.acknowledgements.fullySigned,
        s.acknowledgements.members,
      ),
    },
    ...(s.hasIso27001
      ? [
          {
            id: 'isms_documents',
            section: 'isms',
            title: 'Approve your ISMS documents',
            description:
              'Review and approve the clause 4–10 documents: context, scope, roles, risk methodology, objectives, monitoring, audit and review.',
            href: '/documents?tab=iso-27001',
            ctaLabel: 'Open ISMS',
            references: ['ISO 27001 4–10'],
            done:
              s.ismsDocuments.total > 0 &&
              s.ismsDocuments.approved === s.ismsDocuments.total,
            dependsOn: ['isms_profile'],
            progress: ratio(s.ismsDocuments.approved, s.ismsDocuments.total),
          },
          {
            id: 'statement_of_applicability',
            section: 'isms',
            title: 'Approve the Statement of Applicability',
            description:
              'Justify the inclusion or exclusion of every Annex A control.',
            href: '/documents/statement-of-applicability',
            ctaLabel: 'Open the SoA',
            references: ['ISO 27001 6.1.3 d)'],
            done: s.soaApproved,
            dependsOn: ['isms_profile'],
          },
        ]
      : []),
    ...(s.hasIso27001 || s.hasPciDss ? [assetsScopedSpec(s)] : []),
    ...(s.hasPciDss && s.pciScopeTask
      ? [
          {
            id: 'pci_scope',
            section: 'isms',
            title: 'Confirm your PCI DSS scope',
            description:
              'Document every location and flow of account data and confirm the CDE. Service providers repeat this every six months.',
            href: `/tasks/${s.pciScopeTask.id}`,
            ctaLabel: 'Open the task',
            references: ['PCI DSS 12.5.2', 'PCI DSS 12.5.2.1'],
            done: s.pciScopeTask.done,
          },
        ]
      : []),
    {
      id: 'invite_team',
      section: 'people',
      title: 'Invite your team',
      description:
        'Add teammates (or connect your identity provider) so everyone gets policies and training.',
      href: '/people',
      ctaLabel: 'Invite people',
      references: ['ISO 27001 5.3'],
      done: s.activeMembers > 1,
    },
    {
      id: 'device_monitoring',
      section: 'people',
      title: 'Monitor employee devices',
      description:
        'Install the device agent to check disk encryption, screen lock, antivirus and OS updates.',
      href: '/people/devices',
      ctaLabel: 'Go to devices',
      references: ['ISO 27001 A.8.1', 'PCI DSS 5.2.1'],
      done: s.hasDeviceSource,
    },
    {
      id: 'risks_assessed',
      section: 'risk',
      title: 'Assess your risks',
      description:
        'Review each risk in the register: owner, likelihood, impact and treatment.',
      href: '/risk',
      ctaLabel: 'Go to risks',
      references: ['ISO 27001 6.1.2', 'ISO 27001 8.2', 'PCI DSS 12.3.1'],
      done: s.risks.total > 0 && s.risks.assessed === s.risks.total,
      progress: ratio(s.risks.assessed, s.risks.total),
    },
    {
      id: 'risk_acceptance',
      section: 'risk',
      title: 'Record residual risk acceptance',
      description: 'Risk owners accept the residual risk of each treated risk.',
      href: '/risk',
      ctaLabel: 'Go to risks',
      references: ['ISO 27001 6.1.3 f)'],
      done: s.risks.total > 0 && s.risks.withAcceptance === s.risks.total,
      lockedReason:
        s.risks.total === 0 ? 'Add risks to your register first.' : null,
      progress: ratio(s.risks.withAcceptance, s.risks.total),
    },
    vendorsClassifiedSpec(s),
    {
      id: 'vendors_assessed',
      section: 'risk',
      title: 'Assess your vendors',
      description: 'Review each vendor and its security documents.',
      href: '/vendors',
      ctaLabel: 'Go to vendors',
      references: ['ISO 27001 A.5.19', 'PCI DSS 12.8.1'],
      done: s.vendors.total > 0 && s.vendors.assessed === s.vendors.total,
      progress: ratio(s.vendors.assessed, s.vendors.total),
    },
    {
      id: 'evidence_forms',
      section: 'audit',
      title: 'Submit your first evidence form',
      description:
        'Forms capture meetings, reviews and approvals once and reuse them for every mapped requirement.',
      href: '/documents',
      ctaLabel: 'Go to documents',
      references: [],
      done: s.evidenceSubmissions > 0,
    },
    {
      id: 'evidence_tasks',
      section: 'audit',
      title: 'Complete your evidence tasks',
      description:
        s.tasks.notRelevant > 0
          ? `Connect checks or upload evidence for each task. ${s.tasks.notRelevant} marked not relevant are left out.`
          : 'Connect checks or upload evidence for each task.',
      href: '/tasks',
      ctaLabel: 'Go to evidence',
      references: [],
      done: s.tasks.total > 0 && s.tasks.complete === s.tasks.total,
      progress: ratio(s.tasks.complete, s.tasks.total),
    },
    {
      id: 'auditor_access',
      section: 'audit',
      title: 'Invite your auditor',
      description:
        'Create the audit and invite your auditor: they get read-only access to its requirements and evidence.',
      href: '/audits',
      ctaLabel: 'Go to audits',
      references: [],
      done: s.auditorInvited,
    },
  ];
  return specs;
}
