import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, userEvent } from '@/test/utils/testUtils';
import { ListControls } from '@/components/common/ListControls';
import type { FilterDefinition } from '@/components/common/FilterChips';

const FILTERS: FilterDefinition[] = [
  {
    key: 'role',
    label: 'Role',
    options: [
      { label: 'Judge', value: 'judge' },
      { label: 'Exhibitor', value: 'exhibitor' },
    ],
  },
];

function setup(overrides: Partial<React.ComponentProps<typeof ListControls>> = {}) {
  const onSearchChange = vi.fn();
  const onFilterChange = vi.fn();
  const onViewModeChange = vi.fn();
  const props: React.ComponentProps<typeof ListControls> = {
    search: '',
    onSearchChange,
    searchPlaceholder: 'Search people…',
    filters: FILTERS,
    filterValues: {},
    onFilterChange,
    viewMode: 'cards',
    onViewModeChange,
    resultsShowing: 12,
    resultsTotal: 40,
    filtered: true,
    entityName: 'people',
    ...overrides,
  };
  render(<ListControls {...props} />);
  return { onSearchChange, onFilterChange, onViewModeChange };
}

describe('ListControls', () => {
  it('renders the search box and reports typed input', async () => {
    const user = userEvent.setup();
    const { onSearchChange } = setup();

    const input = screen.getByPlaceholderText('Search people…');
    await user.type(input, 'a');

    expect(onSearchChange).toHaveBeenCalledWith('a');
  });

  it('renders the standard cards/table toggle by default and reports a switch to table', async () => {
    const user = userEvent.setup();
    const { onViewModeChange } = setup();

    expect(screen.getByLabelText('Cards view')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Table view'));

    expect(onViewModeChange).toHaveBeenCalledWith('table');
  });

  it('renders custom view modes when provided', () => {
    setup({
      viewModes: [
        { key: 'cards', label: 'Cards', icon: 'grid' },
        { key: 'table', label: 'Table', icon: 'table' },
        { key: 'calendar', label: 'Calendar', icon: 'calendar' },
      ],
    });

    expect(screen.getByLabelText('Calendar view')).toBeInTheDocument();
  });

  it('can keep view labels visible for novice-facing lists', () => {
    setup({ showViewLabels: true });

    expect(screen.getByLabelText('Cards view')).toHaveTextContent('Cards');
    expect(screen.getByLabelText('Table view')).toHaveTextContent('Table');
  });

  it('reports a filter selection through the FilterChips contract', () => {
    const { onFilterChange } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Role' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Judge' }));

    expect(onFilterChange).toHaveBeenCalledWith('role', 'judge');
  });

  it('opens mobile filters in a sheet and reports the same filter changes', async () => {
    const user = userEvent.setup();
    const { onFilterChange } = setup();

    await user.click(screen.getByRole('button', { name: 'Open filters' }));
    expect(screen.getByRole('heading', { name: 'Filters' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Judge' }));

    expect(onFilterChange).toHaveBeenCalledWith('role', 'judge');
  });

  it('shows the active filter count on the mobile filter button', () => {
    setup({ filterValues: { role: 'judge' } });

    const button = screen.getByRole('button', { name: 'Open filters' });
    expect(button).toHaveTextContent('Filters');
    expect(button).toHaveTextContent('1');
  });

  it('shows the result count when the list is narrowed', () => {
    // "Showing 12 of 40" already conveys that the list is narrowed, so the
    // separate "(filtered)" tag is now kept only for the showing === total case.
    setup();
    expect(screen.getByText('Showing 12 of 40 people')).toBeInTheDocument();
  });

  it('omits the filter row when there are no filters', () => {
    setup({ filters: [] });
    expect(screen.queryByRole('button', { name: 'Role' })).not.toBeInTheDocument();
  });

  it('uses mobile-safe wrapping for search and view controls', () => {
    setup();

    const searchWrapper = screen.getByPlaceholderText('Search people…').parentElement;
    expect(searchWrapper?.className).toContain('w-full');
    expect(searchWrapper?.className).toContain('sm:w-52');

    const tableToggle = screen.getByLabelText('Table view').parentElement;
    expect(tableToggle?.className).toContain('self-end');
    expect(tableToggle?.className).toContain('sm:ml-auto');

    const mobileFilterButton = screen.getByRole('button', { name: 'Open filters' });
    expect(mobileFilterButton.className).toContain('min-h-11');
    expect(mobileFilterButton.className).toContain('sm:hidden');
  });
});
