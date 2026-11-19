import { TableHead, TableHeader, TableRow } from '@trycompai/design-system';
import type { CSSProperties } from 'react';

interface RequirementsTableColumn {
  id: string;
  label: string;
  title?: string;
  width: string;
}

const REQUIREMENTS_TABLE_COLUMNS = [
  { id: 'identifier', label: 'Identifier', width: '10%' },
  { id: 'name', label: 'Name', width: '19%' },
  { id: 'description', label: 'Description', width: '22%' },
  { id: 'compliance', label: 'Compliance', width: '13%' },
  { id: 'status', label: 'Status', width: '11%' },
  { id: 'controls', label: 'Controls', width: '7%' },
  { id: 'policies', label: 'Policies', width: '6.5%' },
  { id: 'tasks', label: 'Tasks', width: '5.5%' },
  { id: 'documents', label: 'Docs', title: 'Documents', width: '6%' },
] as const satisfies readonly RequirementsTableColumn[];

export const REQUIREMENTS_TABLE_COLUMN_COUNT = REQUIREMENTS_TABLE_COLUMNS.length;

// Fixed layout needs a floor width, otherwise narrow columns squeeze their headers into each other.
export const REQUIREMENTS_TABLE_STYLE: CSSProperties = {
  tableLayout: 'fixed',
  minWidth: '960px',
};

export function RequirementsTableColumnGroup() {
  return (
    <colgroup>
      {REQUIREMENTS_TABLE_COLUMNS.map((column) => (
        <col key={column.id} style={{ width: column.width }} />
      ))}
    </colgroup>
  );
}

/** PCI catalog descriptions list the evidence an assessor expects, so the column says so. */
export function RequirementsTableHeader({ descriptionLabel = 'Description' }: { descriptionLabel?: string } = {}) {
  return (
    <TableHeader>
      <TableRow>
        {REQUIREMENTS_TABLE_COLUMNS.map((column) => (
          <TableHead
            key={column.id}
            style={{ width: column.width }}
            title={'title' in column ? column.title : undefined}
          >
            <span className="block truncate">
              {column.id === 'description' ? descriptionLabel : column.label}
            </span>
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}
