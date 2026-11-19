import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextSection } from '../knowledge-base/context/components';
import { QuestionnaireTabs } from './QuestionnaireTabs';

const nav = { search: new URLSearchParams() };
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/org_1/questionnaire',
  useSearchParams: () => nav.search,
  useParams: () => ({ orgId: 'org_1' }),
}));
vi.mock('../start_page/components', () => ({ QuestionnaireOverview: () => <div>questionnaire list</div> }));
vi.mock('../knowledge-base/components/KnowledgeBaseHeader', () => ({ KnowledgeBaseHeader: () => null }));
vi.mock('../knowledge-base/published-policies/components', () => ({ PublishedPoliciesSection: () => null }));
vi.mock('../knowledge-base/manual-answers/components', () => ({ ManualAnswersSection: () => null }));
vi.mock('../knowledge-base/additional-documents/components', () => ({ AdditionalDocumentsSection: () => null }));
vi.mock('@/components/app-onboarding', () => ({ AppOnboarding: () => null }));

const context = [
  { id: 'ctx_1', question: 'Where is data hosted?', answer: 'AWS eu-west-1', tags: [], createdAt: '', updatedAt: '' },
];

const renderTabs = () =>
  render(
    <QuestionnaireTabs
      organizationId="org_1"
      questionnaires={[]}
      hasPublishedPolicies
      policies={[]}
      contextEntries={context}
      manualAnswers={[]}
      documents={[]}
    />,
  );

describe('QuestionnaireTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.search = new URLSearchParams();
  });

  it('opens the Knowledge Base tab from ?tab=knowledge-base', () => {
    nav.search = new URLSearchParams('tab=knowledge-base');
    renderTabs();
    expect(screen.getByRole('tab', { name: 'Knowledge Base' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Where is data hosted?')).toBeInTheDocument();
  });

  it('writes the tab to the URL', () => {
    renderTabs();
    fireEvent.click(screen.getByRole('tab', { name: 'Knowledge Base' }));
    expect(replace).toHaveBeenCalledWith('/org_1/questionnaire?tab=knowledge-base', { scroll: false });
  });
});

describe('ContextSection', () => {
  it('shows context read-only with one Edit in Settings link', () => {
    render(<ContextSection contextEntries={context} />);
    expect(screen.getByRole('link', { name: /Edit in Settings/ })).toHaveAttribute(
      'href',
      '/org_1/settings/context-hub',
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText('AWS eu-west-1')).toBeInTheDocument();
  });
});
