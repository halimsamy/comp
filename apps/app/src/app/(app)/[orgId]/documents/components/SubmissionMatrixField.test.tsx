import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDownloadCsv = vi.fn();
vi.mock('../isms/components/monitoring-csv', () => ({
  downloadCsv: (...args: unknown[]) => mockDownloadCsv(...args),
}));

import { SubmissionMatrixField } from './SubmissionMatrixField';

const columns = [
  { key: 'assetId', label: 'Asset ID' },
  { key: 'environment', label: 'Environment' },
];

beforeEach(() => {
  mockDownloadCsv.mockReset();
});

describe('SubmissionMatrixField', () => {
  it('downloads the rows as CSV', () => {
    render(
      <SubmissionMatrixField
        label="Inventory"
        columns={columns}
        rows={[{ assetId: 'db-1', environment: 'production' }]}
        fileName="infrastructure-inventory-2026-11-11.csv"
      />,
    );

    expect(screen.getByText('db-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /download csv/i }));

    expect(mockDownloadCsv).toHaveBeenCalledWith(
      'infrastructure-inventory-2026-11-11.csv',
      '﻿Asset ID,Environment\r\ndb-1,production\r\n',
    );
  });

  it('hides the download button when there are no rows', () => {
    render(
      <SubmissionMatrixField label="Inventory" columns={columns} rows={[]} fileName="x.csv" />,
    );

    expect(screen.queryByRole('button', { name: /download csv/i })).not.toBeInTheDocument();
  });
});
