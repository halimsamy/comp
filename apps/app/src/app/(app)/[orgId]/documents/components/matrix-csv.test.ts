import { describe, expect, it } from 'vitest';
import { buildMatrixCsv, matrixCsvFilename } from './matrix-csv';

const columns = [
  { key: 'system', label: 'System' },
  { key: 'roleName', label: 'Role Name' },
  { key: 'permissionsScope', label: 'Permissions Scope' },
];

describe('buildMatrixCsv', () => {
  it('writes one header row and one row per matrix row, in column order', () => {
    const csv = buildMatrixCsv({
      columns,
      rows: [
        { roleName: 'Admin', system: 'AWS', permissionsScope: 'Full access' },
        { system: 'Google Workspace', roleName: 'Viewer' },
      ],
    });

    expect(csv).toBe(
      '﻿System,Role Name,Permissions Scope\r\n' +
        'AWS,Admin,Full access\r\n' +
        'Google Workspace,Viewer,\r\n',
    );
  });

  it('quotes commas, quotes and line breaks', () => {
    const csv = buildMatrixCsv({
      columns,
      rows: [{ system: 'AWS, prod', roleName: 'Say "hi"', permissionsScope: 'read\nwrite' }],
    });

    expect(csv.split('\r\n')[1]).toBe('"AWS, prod","Say ""hi""","read\nwrite"');
  });

  it('neutralizes spreadsheet formulas', () => {
    const csv = buildMatrixCsv({
      columns,
      rows: [{ system: '=HYPERLINK("x")', roleName: '+1', permissionsScope: '@SUM(A1)' }],
    });

    expect(csv.split('\r\n')[1]).toBe(`"'=HYPERLINK(""x"")",'+1,'@SUM(A1)`);
  });
});

describe('matrixCsvFilename', () => {
  it('names the file after the form and submission date', () => {
    expect(
      matrixCsvFilename({ formType: 'rbac-matrix', submittedOn: '2026-11-11T10:00:00.000Z' }),
    ).toBe('rbac-matrix-2026-11-11.csv');
  });
});
