import {
  ADMIN_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Overview, type OverviewProps } from './Overview';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('./attention/AttentionGrid', () => ({
  AttentionGrid: () => <div data-testid="attention-grid" />,
}));
vi.mock('./attention/DeadlinesCard', () => ({
  DeadlinesCard: () => <div data-testid="deadlines" />,
}));
vi.mock('./attention/ComplianceTrendCard', () => ({
  ComplianceTrendCard: () => <div data-testid="trends" />,
}));
vi.mock('./FrameworksOverview', () => ({
  FrameworksOverview: () => <div data-testid="frameworks" />,
}));

const props: OverviewProps = {
  frameworksWithControls: [],
  frameworksWithCompliance: [],
  allFrameworks: [],
  organizationId: 'org_1',
  publishedPoliciesScore: { totalPolicies: 0, publishedPolicies: 0 },
  doneTasksScore: { totalTasks: 0, doneTasks: 0 },
  documentsScore: { totalDocuments: 0, completedDocuments: 0, outstandingDocuments: 0 },
  peopleScore: { totalMembers: 0, completedMembers: 0 },
};

describe('Overview', () => {
  it('shows monitoring cards, deadlines and trends to members with app access', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    render(<Overview {...props} />);
    expect(screen.getByTestId('attention-grid')).toBeInTheDocument();
    expect(screen.getByTestId('deadlines')).toBeInTheDocument();
    expect(screen.getByTestId('trends')).toBeInTheDocument();
  });

  it('hides them for a framework-only role without app:read', () => {
    setMockPermissions({ framework: ['read'] });
    render(<Overview {...props} />);
    expect(screen.queryByTestId('attention-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('deadlines')).not.toBeInTheDocument();
    expect(screen.getByTestId('frameworks')).toBeInTheDocument();
  });
});
