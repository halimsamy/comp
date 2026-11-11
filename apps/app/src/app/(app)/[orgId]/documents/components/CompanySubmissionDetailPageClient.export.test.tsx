import {
  ADMIN_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockSwrData: unknown;
const mockDownloadCsv = vi.fn();

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('swr', () => ({
  default: () => ({ data: mockSwrData, isLoading: false, error: null, mutate: vi.fn() }),
}));
vi.mock('@/lib/api-client', () => ({ api: { get: vi.fn(), patch: vi.fn() } }));
vi.mock('../isms/components/monitoring-csv', () => ({
  downloadCsv: (...args: unknown[]) => mockDownloadCsv(...args),
}));
vi.mock('react-markdown', () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock('remark-gfm', () => ({ default: () => {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

type Props = { children?: ReactNode; title?: string; actions?: ReactNode; onClick?: () => void };
const { Pass } = vi.hoisted(() => ({
  Pass: ({ children }: Props) => <div>{children}</div>,
}));
vi.mock('@trycompai/design-system', () => ({
  Button: ({ children, onClick }: Props) => <button onClick={onClick}>{children}</button>,
  Empty: Pass,
  EmptyDescription: Pass,
  EmptyHeader: Pass,
  EmptyMedia: Pass,
  EmptyTitle: Pass,
  Field: Pass,
  FieldLabel: Pass,
  PageHeader: ({ title, actions }: Props) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
  Section: Pass,
  Table: ({ children }: Props) => <table>{children}</table>,
  TableBody: ({ children }: Props) => <tbody>{children}</tbody>,
  TableCell: ({ children }: Props) => <td>{children}</td>,
  TableHead: ({ children }: Props) => <th>{children}</th>,
  TableHeader: ({ children }: Props) => <thead>{children}</thead>,
  TableRow: ({ children }: Props) => <tr>{children}</tr>,
  Text: Pass,
  Textarea: () => <textarea />,
}));
vi.mock('@trycompai/design-system/icons', () => ({
  Document: () => null,
  Download: () => null,
}));

import { evidenceFormDefinitions } from '../forms';
import { CompanySubmissionDetailPageClient } from './CompanySubmissionDetailPageClient';

function submissionWith({
  formType,
  data,
}: {
  formType: 'rbac-matrix' | 'access-request';
  data: Record<string, unknown>;
}) {
  return {
    form: evidenceFormDefinitions[formType],
    submission: {
      id: 'evs_1',
      submittedAt: '2026-11-11T09:00:00.000Z',
      status: 'pending',
      data,
      submittedBy: { name: 'Halim', email: 'halim@example.com' },
    },
  };
}

beforeEach(() => {
  mockDownloadCsv.mockReset();
  setMockPermissions(ADMIN_PERMISSIONS);
});

describe('CompanySubmissionDetailPageClient export', () => {
  it('exports the matrix from the page header as CSV', () => {
    mockSwrData = submissionWith({
      formType: 'rbac-matrix',
      data: {
        submissionDate: '2026-11-10',
        matrixRows: [
          {
            system: 'AWS',
            roleName: 'Admin',
            permissionsScope: 'Full',
            approvedBy: 'CTO',
            lastReviewed: '2026-11-01',
          },
        ],
      },
    });
    render(
      <CompanySubmissionDetailPageClient
        organizationId="org_1"
        formType="rbac-matrix"
        submissionId="evs_1"
      />,
    );

    expect(screen.getByRole('heading', { name: 'RBAC Matrix Submission' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    const [fileName, csv] = mockDownloadCsv.mock.calls[0] as [string, string];
    expect(fileName).toBe('rbac-matrix-2026-11-10.csv');
    expect(csv.split('\r\n')[1]).toBe('AWS,Admin,Full,CTO,2026-11-01');
  });

  it('has no export for forms without a table', () => {
    mockSwrData = submissionWith({
      formType: 'access-request',
      data: { submissionDate: '2026-11-10' },
    });
    render(
      <CompanySubmissionDetailPageClient
        organizationId="org_1"
        formType="access-request"
        submissionId="evs_1"
      />,
    );

    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
  });
});
