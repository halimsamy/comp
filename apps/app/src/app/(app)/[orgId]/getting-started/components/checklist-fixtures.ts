import type { ChecklistItem, OnboardingChecklist } from '@/hooks/use-onboarding-checklist';

export const makeItem = (overrides: Partial<ChecklistItem> & { id: string }): ChecklistItem => ({
  title: overrides.id,
  description: `${overrides.id} description`,
  status: 'todo',
  href: '/somewhere',
  ctaLabel: 'Go',
  references: [],
  dependsOn: [],
  lockedReason: null,
  progress: null,
  skip: null,
  ...overrides,
});

export const checklistFixture: OnboardingChecklist = {
  completed: 2,
  total: 5,
  percent: 40,
  isComplete: false,
  sections: [
    {
      id: 'systems',
      title: 'Connect key systems',
      description: 'Integrations collect evidence for you.',
      completed: 1,
      total: 2,
      items: [
        makeItem({
          id: 'identity_provider',
          title: 'Connect your identity provider',
          status: 'done',
          href: '/integrations',
        }),
        makeItem({
          id: 'cloud_provider',
          title: 'Connect your cloud provider',
          href: '/integrations',
          ctaLabel: 'Connect',
          references: ['ISO 27001 A.8.9'],
        }),
      ],
    },
    {
      id: 'policies',
      title: 'Launch policies',
      description: 'Publish your policies.',
      completed: 1,
      total: 2,
      items: [
        makeItem({
          id: 'policies_published',
          title: 'Review and publish your policies',
          href: '/policies/pol_1',
          progress: { done: 3, total: 10 },
        }),
        makeItem({
          id: 'policies_acknowledged',
          title: 'Get employees to accept policies',
          status: 'skipped',
          skip: {
            reason: 'Handled in HR system',
            skippedAt: '2026-11-18T00:00:00Z',
            skippedById: null,
          },
        }),
      ],
    },
    {
      id: 'audit',
      title: 'Prepare for your audit',
      description: 'Give your auditor access.',
      completed: 0,
      total: 1,
      items: [
        makeItem({
          id: 'auditor_access',
          title: 'Invite your auditor',
          status: 'locked',
          lockedReason: 'Finish first: Review and publish your policies.',
        }),
      ],
    },
  ],
};
