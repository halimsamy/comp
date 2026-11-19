import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PolicyVersionWithPublisher } from '../hooks/usePolicyVersions';
import { PolicyVersionCard } from './PolicyVersionCard';

const person = (name: string) => ({ user: { id: name, name, image: null } });

const version = (overrides: Partial<PolicyVersionWithPublisher> = {}) =>
  ({
    id: 'pv_2',
    version: 2,
    changelog: 'Tightened access reviews',
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    publishedBy: null,
    submittedAt: new Date('2026-09-28T10:00:00Z'),
    submittedBy: person('Sam Submitter'),
    approvedAt: null,
    approvedBy: null,
    approvalComment: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionComment: null,
    reviews: [],
    _count: { acknowledgements: 0 },
    ...overrides,
  }) as PolicyVersionWithPublisher;

describe('PolicyVersionCard', () => {
  it('shows the approval record, reviews and acknowledgements of a published version', () => {
    render(
      <PolicyVersionCard
        state="published"
        actions={null}
        version={version({
          approvedAt: new Date('2026-10-01T00:00:00Z'),
          approvedBy: person('Adam Approver') as PolicyVersionWithPublisher['approvedBy'],
          approvalComment: 'Looks good',
          reviews: [
            { id: 'r1', reviewedAt: '2026-11-01T00:00:00Z', notes: null, reviewer: { user: { name: 'Rita' } } },
          ],
          _count: { acknowledgements: 12 },
        })}
      />,
    );
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Approved by Adam Approver on Oct 1, 2026')).toBeInTheDocument();
    expect(screen.getByText(/Note: “Looks good”/)).toBeInTheDocument();
    expect(screen.getByText(/Reviewed once · last on Nov 1, 2026 by Rita/)).toBeInTheDocument();
    expect(screen.getByText('Acknowledged by 12 employees')).toBeInTheDocument();
  });

  it('shows who rejected a version and why', () => {
    render(
      <PolicyVersionCard
        state="rejected"
        actions={null}
        version={version({
          rejectedAt: new Date('2026-09-30T00:00:00Z'),
          rejectedBy: person('Adam Approver') as PolicyVersionWithPublisher['rejectedBy'],
          rejectionComment: 'Section 3 is missing MFA',
        })}
      />,
    );
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('Submitted by Sam Submitter on Sep 28, 2026')).toBeInTheDocument();
    expect(screen.getByText('Rejected by Adam Approver on Sep 30, 2026')).toBeInTheDocument();
    expect(screen.getByText(/Reason: “Section 3 is missing MFA”/)).toBeInTheDocument();
  });
});
