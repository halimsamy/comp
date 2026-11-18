import type { SearchEntry } from '@/hooks/use-search-index';
import { describe, expect, it, vi } from 'vitest';
import { buildSearchEntryGroups, searchEntryHref } from './search-entry-groups';

const entry = (
  overrides: Partial<SearchEntry> & Pick<SearchEntry, 'type' | 'id'>,
): SearchEntry => ({
  label: overrides.id,
  description: null,
  keywords: [],
  parentId: null,
  ...overrides,
});

describe('searchEntryHref', () => {
  it('deep-links each object type to its native page', () => {
    const href = (e: SearchEntry) => searchEntryHref({ entry: e, organizationId: 'org_1' });
    expect(href(entry({ type: 'requirement', id: 'req_1', parentId: 'frm_1' }))).toBe(
      '/org_1/frameworks/frm_1/requirements/req_1',
    );
    expect(href(entry({ type: 'control', id: 'ctl_1' }))).toBe('/org_1/controls/ctl_1');
    expect(href(entry({ type: 'task', id: 'tsk_1' }))).toBe('/org_1/tasks/tsk_1');
    expect(href(entry({ type: 'person', id: 'mem_1' }))).toBe('/org_1/people/mem_1');
    expect(href(entry({ type: 'isms_document', id: 'isms_scope' }))).toBe(
      '/org_1/documents/isms/scope',
    );
    expect(href(entry({ type: 'isms_document', id: 'not_a_type' }))).toBeNull();
    expect(href(entry({ type: 'requirement', id: 'req_1' }))).toBeNull();
  });
});

describe('buildSearchEntryGroups', () => {
  it('groups entries by type in a fixed order and navigates on select', () => {
    const push = vi.fn();
    const groups = buildSearchEntryGroups({
      organizationId: 'org_1',
      push,
      entries: [
        entry({ type: 'vendor', id: 'vnd_1', label: 'AWS', keywords: ['aws.amazon.com'] }),
        entry({
          type: 'requirement',
          id: 'req_1',
          parentId: 'frm_1',
          label: 'PCI DSS 8.3.6 · Passwords',
          description: 'PCI DSS',
        }),
      ],
    });

    expect(groups.map((g) => g.label)).toEqual(['Requirements', 'Vendors']);
    expect(groups[0].items[0].keywords).toEqual(['PCI DSS']);
    groups[1].items[0].onSelect?.();
    expect(push).toHaveBeenCalledWith('/org_1/vendors/vnd_1');
  });

  it('adds ISMS overview and SoA shortcuts when the org has ISMS documents', () => {
    const groups = buildSearchEntryGroups({
      organizationId: 'org_1',
      push: vi.fn(),
      entries: [entry({ type: 'isms_document', id: 'monitoring', label: 'Monitoring' })],
    });
    expect(groups[0].items.map((i) => i.label)).toEqual([
      'ISMS overview',
      'Statement of Applicability',
      'Monitoring',
    ]);
  });
});
