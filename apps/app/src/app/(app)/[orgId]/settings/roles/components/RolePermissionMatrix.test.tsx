import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockDownload = vi.fn();
vi.mock('@/components/risks/workspace/risk-actions-csv', () => ({
  downloadCsv: (...a: unknown[]) => mockDownload(...a),
}));

import { buildRoleMatrix, buildRoleMatrixCsv } from './role-matrix';
import { RolePermissionMatrix } from './RolePermissionMatrix';
import type { CustomRole } from './RolesTable';

const custom: CustomRole = {
  id: 'rol_1',
  name: '=Risk owner',
  permissions: { risk: ['read', 'update'] },
  obligations: {},
  isBuiltIn: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('role permission matrix', () => {
  it('lists every permission for system and custom roles', () => {
    const matrix = buildRoleMatrix([custom]);
    expect(matrix.roles.map((r) => r.name)).toEqual([
      'owner',
      'admin',
      'auditor',
      'employee',
      'contractor',
      '=Risk owner',
    ]);
    const riskUpdate = matrix.rows.find((r) => r.resource === 'risk' && r.action === 'update');
    expect(riskUpdate?.granted).toEqual([true, true, false, false, false, true]);
    const riskDelete = matrix.rows.find((r) => r.resource === 'risk' && r.action === 'delete');
    expect(riskDelete?.granted.at(-1)).toBe(false);
  });

  it('exports CSV with formula-safe role names', () => {
    const csv = buildRoleMatrixCsv(buildRoleMatrix([custom]));
    const [header, ...rows] = csv.split('\r\n');
    expect(header).toBe(
      '"Resource","Action","Owner","Admin","Auditor","Employee","Contractor","\'=Risk owner"',
    );
    expect(rows).toContain('"risk","update","Yes","Yes","No","No","No","Yes"');
  });

  it('downloads the CSV from the tab', () => {
    render(<RolePermissionMatrix customRoles={[custom]} />);
    expect(screen.getByText('risk:update')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }));
    expect(mockDownload).toHaveBeenCalledWith(
      expect.objectContaining({ filename: expect.stringMatching(/^permission-matrix-/) }),
    );
  });
});
