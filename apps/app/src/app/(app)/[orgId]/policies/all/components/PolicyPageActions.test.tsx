import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setMockPermissions,
  mockHasPermission,
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
} from '@/test-utils/mocks/permissions';

// Mock usePermissions
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    permissions: {},
    hasPermission: mockHasPermission,
  }),
}));

// Mock CreatePolicySheet — renders nothing
vi.mock('@/components/sheets/create-policy-sheet', () => ({
  CreatePolicySheet: () => <div data-testid="create-policy-sheet" />,
}));

// Mock PolicyDownloadSheet — only renders when open
vi.mock('./PolicyDownloadSheet', () => ({
  PolicyDownloadSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="policy-download-sheet" /> : null,
}));

// Mock BulkUploadPoliciesSheet — only renders when open
vi.mock('./BulkUploadPoliciesSheet', () => ({
  BulkUploadPoliciesSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="bulk-upload-sheet" /> : null,
}));

// Mock api client
vi.mock('@/lib/api-client', () => ({
  api: { get: vi.fn() },
}));

vi.mock('@/utils/auth-client', () => ({
  authClient: { useActiveMember: () => ({ data: { id: 'mem_me' } }) },
}));

const mockDownloadCsv = vi.fn();
vi.mock('@/hooks/use-policy-lifecycle', () => ({
  downloadAcknowledgementsCsv: (...args: unknown[]) => mockDownloadCsv(...args),
}));

import { PolicyPageActions } from './PolicyPageActions';

const basePolicies = [
  {
    id: 'p1',
    name: 'Security Policy',
    organizationId: 'org-1',
    status: 'draft',
    content: null,
    description: null,
    isArchived: false,
    departmentId: null,
    frequency: null,
    approverId: null,
    currentVersionId: null,
    pendingVersionId: null,
    lastPublishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
] as any;

describe('PolicyPageActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('admin permissions', () => {
    beforeEach(() => {
      setMockPermissions(ADMIN_PERMISSIONS);
    });

    it('renders the Create Policy button when user has policy:create', () => {
      render(<PolicyPageActions policies={basePolicies} />);

      expect(
        screen.getByRole('button', { name: /create policy/i }),
      ).toBeInTheDocument();
    });

    it('renders the Download All button when policies exist', () => {
      render(<PolicyPageActions policies={basePolicies} />);

      expect(
        screen.getByRole('button', { name: /download all/i }),
      ).toBeInTheDocument();
    });

    it('opens the download sheet when Download All is clicked', async () => {
      const user = userEvent.setup();
      render(<PolicyPageActions policies={basePolicies} />);

      await user.click(screen.getByRole('button', { name: /download all/i }));

      expect(screen.getByTestId('policy-download-sheet')).toBeInTheDocument();
    });

    it('renders the Bulk upload button when user has policy:create', () => {
      render(<PolicyPageActions policies={basePolicies} />);

      expect(
        screen.getByRole('button', { name: /bulk upload/i }),
      ).toBeInTheDocument();
    });

    it('opens the bulk upload sheet when Bulk upload is clicked', async () => {
      const user = userEvent.setup();
      render(<PolicyPageActions policies={basePolicies} />);

      await user.click(screen.getByRole('button', { name: /bulk upload/i }));

      expect(screen.getByTestId('bulk-upload-sheet')).toBeInTheDocument();
    });
  });

  describe('policy:create without policy:update', () => {
    beforeEach(() => {
      // Bulk upload also attaches a PDF (needs policy:update); create alone
      // would leave orphan draft policies, so the button must be hidden.
      setMockPermissions({ policy: ['read', 'create'] });
    });

    it('does not render the Bulk upload button without policy:update', () => {
      render(<PolicyPageActions policies={basePolicies} />);

      expect(
        screen.queryByRole('button', { name: /bulk upload/i }),
      ).not.toBeInTheDocument();
    });

    it('still renders the Create Policy button', () => {
      render(<PolicyPageActions policies={basePolicies} />);

      expect(
        screen.getByRole('button', { name: /create policy/i }),
      ).toBeInTheDocument();
    });
  });

  describe('auditor permissions (no policy:create)', () => {
    beforeEach(() => {
      setMockPermissions(AUDITOR_PERMISSIONS);
    });

    it('does not render the Create Policy button', () => {
      render(<PolicyPageActions policies={basePolicies} />);

      expect(
        screen.queryByRole('button', { name: /create policy/i }),
      ).not.toBeInTheDocument();
    });

    it('does not render the Bulk upload button', () => {
      render(<PolicyPageActions policies={basePolicies} />);

      expect(
        screen.queryByRole('button', { name: /bulk upload/i }),
      ).not.toBeInTheDocument();
    });

    it('still renders the Download All button', () => {
      render(<PolicyPageActions policies={basePolicies} />);

      expect(
        screen.getByRole('button', { name: /download all/i }),
      ).toBeInTheDocument();
    });
  });

  describe('empty policies', () => {
    beforeEach(() => {
      setMockPermissions(ADMIN_PERMISSIONS);
    });

    it('does not render Download All when there are no policies', () => {
      render(<PolicyPageActions policies={[]} />);

      expect(
        screen.queryByRole('button', { name: /download all/i }),
      ).not.toBeInTheDocument();
    });

    it('still renders Create Policy when there are no policies', () => {
      render(<PolicyPageActions policies={[]} />);

      expect(
        screen.getByRole('button', { name: /create policy/i }),
      ).toBeInTheDocument();
    });
  });

  describe('acknowledgements export and my approvals', () => {
    it('exports every acknowledgement for read-only users too', async () => {
      setMockPermissions(AUDITOR_PERMISSIONS);
      render(<PolicyPageActions policies={basePolicies as never} />);
      await userEvent.click(screen.getByRole('button', { name: /export acknowledgements/i }));
      expect(mockDownloadCsv).toHaveBeenCalledWith({});
    });

    it('shows a chip with the policies awaiting my approval', () => {
      setMockPermissions(ADMIN_PERMISSIONS);
      const pending = [
        { ...basePolicies[0], id: 'p9', approverId: 'mem_me', pendingVersionId: 'pv_9' },
        { ...basePolicies[0], id: 'p8', approverId: 'mem_other', pendingVersionId: 'pv_8' },
      ];
      render(<PolicyPageActions policies={pending as never} />);
      expect(screen.getByRole('link', { name: 'Awaiting my approval (1)' })).toHaveAttribute(
        'href',
        expect.stringContaining('awaiting=me'),
      );
    });
  });
});
