'use client';

import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { Download } from '@trycompai/design-system/icons';
import { downloadCsv } from '../isms/components/monitoring-csv';
import { buildMatrixCsv } from './matrix-csv';
import type { MatrixColumnDefinition, MatrixRowValue } from './submission-utils';

export function SubmissionMatrixField({
  label,
  columns,
  rows,
  fileName,
}: {
  label: string;
  columns: ReadonlyArray<MatrixColumnDefinition>;
  rows: MatrixRowValue[];
  fileName: string;
}) {
  const handleDownload = () => downloadCsv(fileName, buildMatrixCsv({ columns, rows }));

  return (
    <div className="grid grid-cols-1 gap-2 p-4 lg:grid-cols-3">
      <div className="flex flex-col items-start gap-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {rows.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            iconLeft={<Download size={16} />}
            onClick={handleDownload}
          >
            Download CSV
          </Button>
        )}
      </div>
      <div className="min-w-0 overflow-x-auto lg:col-span-2 text-sm">
        {rows.length === 0 ? (
          <Text size="sm" variant="muted">
            —
          </Text>
        ) : (
          <Table variant="bordered">
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      <div className="whitespace-pre-wrap">{row[column.key] || '—'}</div>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
