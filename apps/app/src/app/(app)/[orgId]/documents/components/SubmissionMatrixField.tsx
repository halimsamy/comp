import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import type { MatrixColumnDefinition, MatrixRowValue } from './submission-utils';

export function SubmissionMatrixField({
  label,
  columns,
  rows,
}: {
  label: string;
  columns: ReadonlyArray<MatrixColumnDefinition>;
  rows: MatrixRowValue[];
}) {
  return (
    <div className="grid grid-cols-1 gap-2 p-4 lg:grid-cols-3">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
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
