import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppCommandSearch } from './AppCommandSearch';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const useSearchIndex = vi.fn();
vi.mock('@/hooks/use-search-index', () => ({
  useSearchIndex: (args: { enabled: boolean }) => useSearchIndex(args),
}));

// cmdk relies on browser APIs jsdom lacks.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
Element.prototype.scrollIntoView = vi.fn();

describe('AppCommandSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSearchIndex.mockReturnValue({
      entries: [
        {
          type: 'policy',
          id: 'pol_1',
          label: 'Access Control Policy',
          description: 'Policy',
          keywords: [],
          parentId: null,
        },
      ],
      isLoading: false,
      error: undefined,
    });
  });

  it('loads the object index only once the palette is opened', () => {
    render(<AppCommandSearch organizationId="org_1" staticGroups={[]} />);
    expect(useSearchIndex).toHaveBeenLastCalledWith({ enabled: false });

    fireEvent.click(screen.getByText('Search or jump to…'));
    expect(useSearchIndex).toHaveBeenLastCalledWith({ enabled: true });
  });

  it('navigates to a found object', () => {
    render(<AppCommandSearch organizationId="org_1" staticGroups={[]} />);
    fireEvent.click(screen.getByText('Search or jump to…'));
    fireEvent.click(screen.getByText('Access Control Policy'));
    expect(push).toHaveBeenCalledWith('/org_1/policies/pol_1');
  });
});
