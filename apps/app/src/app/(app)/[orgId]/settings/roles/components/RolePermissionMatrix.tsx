'use client';

import {
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { Checkmark, Download } from '@trycompai/design-system/icons';
import { useMemo } from 'react';
import { buildRoleMatrix, downloadRoleMatrixCsv } from './role-matrix';
import type { CustomRole } from './RolesTable';

/** Read-only who-can-do-what grid for access reviews (ISO 27001 A.5.15/A.5.18, PCI DSS 7.2). */
export function RolePermissionMatrix({ customRoles }: { customRoles: CustomRole[] }) {
  const matrix = useMemo(() => buildRoleMatrix(customRoles), [customRoles]);

  return (
    <Stack gap="md">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Text size="sm" variant="muted">
          Every permission each role grants. Export it as evidence for access reviews.
        </Text>
        <Button
          variant="outline"
          iconLeft={<Download size={16} />}
          onClick={() => downloadRoleMatrixCsv(matrix)}
        >
          Export CSV
        </Button>
      </div>
      <div className="max-w-full overflow-x-auto">
        <Table variant="bordered">
          <TableHeader>
            <TableRow>
              <TableHead>PERMISSION</TableHead>
              {matrix.roles.map((role) => (
                <TableHead key={role.name}>
                  <div className="whitespace-nowrap text-center">{role.label}</div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrix.rows.map((row) => (
              <TableRow key={`${row.resource}:${row.action}`}>
                <TableCell>
                  <span className="whitespace-nowrap font-mono text-xs">
                    {row.resource}:{row.action}
                  </span>
                </TableCell>
                {row.granted.map((granted, i) => (
                  <TableCell key={matrix.roles[i].name}>
                    <div className="flex justify-center">
                      {granted ? (
                        <Checkmark size={16} aria-label="Granted" />
                      ) : (
                        <span className="text-muted-foreground" aria-label="Not granted">
                          —
                        </span>
                      )}
                    </div>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Stack>
  );
}
