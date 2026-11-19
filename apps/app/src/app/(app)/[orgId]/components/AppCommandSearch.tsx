'use client';

import { useSearchIndex } from '@/hooks/use-search-index';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Kbd,
  type CommandSearchGroup,
  type CommandSearchItem,
} from '@trycompai/design-system';
import { Search } from '@trycompai/design-system/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { paletteScore } from './palette-filter';
import { buildSearchEntryGroups } from './search-entry-groups';

const OPEN_EVENT = 'app-command-search:open';

/** Open the palette from anywhere (mobile navbar icon, mobile drawer). */
export function openAppSearch() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * ⌘K palette: page links plus the org's requirements, controls, policies, tasks, ISMS
 * documents, risks, vendors, people, assets, findings, audits and more. The object
 * index loads the first time it opens. Below md the navbar shows AppSearchIconButton instead.
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'k' || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      setHasOpened(true);
      setOpen((current) => !current);
    };
    const handleOpenEvent = () => {
      setHasOpened(true);
      setOpen(true);
    };
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener(OPEN_EVENT, handleOpenEvent);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener(OPEN_EVENT, handleOpenEvent);
    };
  }, []);

  const groups = useMemo(
    () => [
      ...staticGroups,
      ...buildSearchEntryGroups({ entries, organizationId, push: router.push }),
    ],
    [staticGroups, entries, organizationId, router.push],
  );

  const handleSelect = (item: CommandSearchItem) => {
    setOpen(false);
    item.onSelect?.();
  };

  const emptyText = isLoading
    ? 'Loading your workspace…'
    : error
      ? 'Search is unavailable right now.'
      : 'No results found.';

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        aria-label="Search"
        className="hidden w-56 items-center gap-2 rounded-lg border border-input/50 bg-background/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-input hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex lg:w-72"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <CommandDialog open={open} onOpenChange={handleOpenChange}>
        <Command filter={paletteScore}>
          <CommandInput placeholder="Search or jump to…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.id} heading={group.label || undefined}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.label}
                    keywords={item.keywords}
                    onSelect={() => handleSelect(item)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

/** Navbar search icon for small screens, where the centered trigger is hidden. */
export function AppSearchIconButton() {
  return (
    <button
      type="button"
      onClick={openAppSearch}
      aria-label="Open search"
      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
    >
      <Search className="size-4" />
    </button>
  );
}
