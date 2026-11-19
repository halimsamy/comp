import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppCommandSearch, AppSearchIconButton } from './AppCommandSearch';

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

  it('ranks an exact requirement code first', async () => {
    useSearchIndex.mockReturnValue({
      entries: [
        {
          type: 'requirement',
          id: 'r1',
          label: 'ISO 27001 A.5.1 · Policies',
          description: null,
          keywords: [],
          parentId: 'f1',
        },
        {
          type: 'requirement',
          id: 'r2',
          label: 'ISO 27001 A.5.150 · Other',
          description: null,
          keywords: [],
          parentId: 'f1',
        },
        {
          type: 'requirement',
          id: 'r3',
          label: 'ISO 27001 A.5.15 · Access control',
          description: null,
          keywords: [],
          parentId: 'f1',
        },
      ],
      isLoading: false,
      error: undefined,
    });
    render(<AppCommandSearch organizationId="org_1" staticGroups={[]} />);
    fireEvent.click(screen.getByText('Search or jump to…'));
    fireEvent.change(screen.getByPlaceholderText('Search or jump to…'), {
      target: { value: 'A.5.15' },
    });
    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveTextContent('A.5.15 · Access control');
    expect(options.map((o) => o.textContent)).not.toContain('ISO 27001 A.5.1 · Policies');
  });

  it('opens from the mobile search icon', () => {
    render(
      <>
        <AppSearchIconButton />
        <AppCommandSearch organizationId="org_1" staticGroups={[]} />
      </>,
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Open search' }));
    });
    expect(useSearchIndex).toHaveBeenLastCalledWith({ enabled: true });
    expect(screen.getByPlaceholderText('Search or jump to…')).toBeInTheDocument();
  });
});
