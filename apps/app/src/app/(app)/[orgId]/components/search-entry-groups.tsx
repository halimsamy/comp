import type { SearchEntry, SearchEntryType } from '@/hooks/use-search-index';
import type { CommandSearchGroup } from '@trycompai/design-system';
import {
  Book,
  Catalog,
  ListChecked,
  Policy,
  Rule,
  ShoppingBag,
  Table,
  User,
  Warning,
} from '@trycompai/design-system/icons';
import type { ReactNode } from 'react';
import {
  ISMS_TYPE_META,
  ismsTypeToSlug,
  type IsmsDocumentType,
} from '../documents/isms/isms-types';

const GROUPS: Array<{ type: SearchEntryType; label: string; icon: ReactNode }> = [
  { type: 'requirement', label: 'Requirements', icon: <Rule size={16} /> },
  { type: 'control', label: 'Controls', icon: <Catalog size={16} /> },
  { type: 'policy', label: 'Policies', icon: <Policy size={16} /> },
  { type: 'task', label: 'Evidence tasks', icon: <ListChecked size={16} /> },
  { type: 'isms_document', label: 'ISMS', icon: <Book size={16} /> },
  { type: 'risk', label: 'Risks', icon: <Warning size={16} /> },
  { type: 'vendor', label: 'Vendors', icon: <ShoppingBag size={16} /> },
  { type: 'person', label: 'People', icon: <User size={16} /> },
];

const isIsmsType = (value: string): value is IsmsDocumentType =>
  ISMS_TYPE_META.some((meta) => meta.type === value);

/** App URL of a search hit; null when it can't be linked (e.g. an unknown ISMS type). */
export function searchEntryHref({
  entry,
  organizationId,
}: {
  entry: SearchEntry;
  organizationId: string;
}) {
  const base = `/${organizationId}`;
  switch (entry.type) {
    case 'requirement':
      return entry.parentId
        ? `${base}/frameworks/${entry.parentId}/requirements/${entry.id}`
        : null;
    case 'control':
      return `${base}/controls/${entry.id}`;
    case 'policy':
      return `${base}/policies/${entry.id}`;
    case 'task':
      return `${base}/tasks/${entry.id}`;
    case 'risk':
      return `${base}/risk/${entry.id}`;
    case 'vendor':
      return `${base}/vendors/${entry.id}`;
    case 'person':
      return `${base}/people/${entry.id}`;
    case 'isms_document':
      return isIsmsType(entry.id) ? `${base}/documents/isms/${ismsTypeToSlug(entry.id)}` : null;
  }
}

/**
 * Command palette groups for the org's objects. cmdk filters them client-side.
 * shortcut: cmdk keys items by label, so two objects with the same label share a highlight; add a suffix if that bites.
 */
export function buildSearchEntryGroups({
  entries,
  organizationId,
  push,
}: {
  entries: SearchEntry[];
  organizationId: string;
  push: (href: string) => void;
}): CommandSearchGroup[] {
  const hasIsms = entries.some((entry) => entry.type === 'isms_document');

  return GROUPS.map(({ type, label, icon }) => {
    const items = entries.flatMap((entry) => {
      if (entry.type !== type) return [];
      const href = searchEntryHref({ entry, organizationId });
      if (!href) return [];
      return [
        {
          id: `${entry.type}:${entry.parentId ?? ''}:${entry.id}`,
          label: entry.label,
          icon,
          keywords: [entry.description ?? '', ...entry.keywords].filter(Boolean),
          onSelect: () => push(href),
        },
      ];
    });
    // ISMS documents only exist for ISO 27001 orgs, so they also tell us to offer the SoA.
    if (type === 'isms_document' && hasIsms) {
      items.unshift(
        {
          id: 'isms:overview',
          label: 'ISMS overview',
          icon,
          keywords: ['iso 27001', 'clauses 4-10'],
          onSelect: () => push(`/${organizationId}/documents?tab=iso-27001`),
        },
        {
          id: 'isms:soa',
          label: 'Statement of Applicability',
          icon: <Table size={16} />,
          keywords: ['soa', 'annex a', '6.1.3'],
          onSelect: () => push(`/${organizationId}/documents/statement-of-applicability`),
        },
      );
    }
    return { id: `objects-${type}`, label, items };
  }).filter((group) => group.items.length > 0);
}
