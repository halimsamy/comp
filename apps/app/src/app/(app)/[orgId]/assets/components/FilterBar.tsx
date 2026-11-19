'use client';

import { DataTableSearch } from '@trycompai/design-system';
import type { ReactNode } from 'react';

/**
 * Search plus filters that wrap instead of overflowing: the search shrinks
 * (min-w-0) and the filter selects flow onto new lines at narrow widths.
 */
export function FilterBar({
  placeholder,
  search,
  onSearch,
  children,
}: {
  placeholder: string;
  search: string;
  onSearch: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="flex min-w-0 basis-full sm:basis-60 sm:flex-1">
        <DataTableSearch placeholder={placeholder} value={search} onChange={onSearch} />
      </div>
      <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
        {children}
      </div>
    </div>
  );
}
