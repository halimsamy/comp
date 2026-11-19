import { downloadCsv } from '@/components/risks/workspace/risk-actions-csv';
import { BUILT_IN_ROLE_PERMISSIONS, statement } from '@trycompai/auth';
import { SYSTEM_ROLES } from '../constants/system-roles';

export interface MatrixRole {
  name: string;
  label: string;
  permissions: Record<string, string[]>;
}

export interface MatrixRow {
  resource: string;
  action: string;
  granted: boolean[];
}

/** Every `resource:action` from permissions.ts × every role (system first, then custom). */
export function buildRoleMatrix(
  customRoles: Array<{ name: string; permissions: Record<string, string[]> }>,
) {
  const roles: MatrixRole[] = [
    ...SYSTEM_ROLES.map((r) => ({
      name: r.key,
      label: r.name,
      permissions: BUILT_IN_ROLE_PERMISSIONS[r.key] ?? {},
    })),
    ...customRoles.map((r) => ({ name: r.name, label: r.name, permissions: r.permissions ?? {} })),
  ];
  const rows: MatrixRow[] = Object.entries(statement).flatMap(([resource, actions]) =>
    actions.map((action) => ({
      resource,
      action,
      granted: roles.map((role) => role.permissions[resource]?.includes(action) ?? false),
    })),
  );
  return { roles, rows };
}

/** Quote a CSV cell; neutralise spreadsheet formulas in custom role names. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildRoleMatrixCsv({ roles, rows }: ReturnType<typeof buildRoleMatrix>): string {
  const header = ['Resource', 'Action', ...roles.map((r) => r.label)];
  const body = rows.map((row) => [
    row.resource,
    row.action,
    ...row.granted.map((g) => (g ? 'Yes' : 'No')),
  ]);
  return [header, ...body].map((line) => line.map(cell).join(',')).join('\r\n');
}

export function downloadRoleMatrixCsv(matrix: ReturnType<typeof buildRoleMatrix>) {
  downloadCsv({
    csv: buildRoleMatrixCsv(matrix),
    filename: `permission-matrix-${new Date().toISOString().slice(0, 10)}.csv`,
  });
}
