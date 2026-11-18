'use client';

import { useSearchIndex } from '@/hooks/use-search-index';
import { CommandSearch, type CommandSearchGroup } from '@trycompai/design-system';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { buildSearchEntryGroups } from './search-entry-groups';

/**
 * ⌘K palette: page links plus the org's requirements, controls, policies, tasks, ISMS
 * documents, risks, vendors and people. The object index loads the first time it opens.
 */
export function AppCommandSearch({
  organizationId,
  staticGroups,
}: {
  organizationId: string;
  staticGroups: CommandSearchGroup[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const { entries, isLoading, error } = useSearchIndex({ enabled: hasOpened });

  const handleOpenChange = (next: boolean) => {
    if (next) setHasOpened(true);
    setOpen(next);
  };

  const groups = useMemo(
    () => [
      ...staticGroups,
      ...buildSearchEntryGroups({ entries, organizationId, push: router.push }),
    ],
    [staticGroups, entries, organizationId, router.push],
  );

  const emptyText = isLoading
    ? 'Loading your workspace…'
    : error
      ? 'Search is unavailable right now.'
      : 'No results found.';

  return (
    <CommandSearch
      groups={groups}
      open={open}
      onOpenChange={handleOpenChange}
      placeholder="Search or jump to…"
      emptyText={emptyText}
    />
  );
}
