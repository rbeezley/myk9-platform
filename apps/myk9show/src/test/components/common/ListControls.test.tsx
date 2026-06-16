import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('reports a filter selection through the FilterChips contract', async () => {
    const user = userEvent.setup();
    const { onFilterChange } = setup();

    await user.click(screen.getByRole('button', { name: 'Role' }));
    await user.click(screen.getByRole('button', { name: 'Judge' }));

    expect(onFilterChange).toHaveBeenCalledWith('role', 'judge');
  });

  it('shows the result count with the filtered indicator', () => {
    setup();
    expect(screen.getByText(/12 of 40 people/)).toBeInTheDocument();
    expect(screen.getByText(/\(filtered\)/)).toBeInTheDocument();
  });

  it('omits the filter row when there are no filters', () => {
    setup({ filters: [] });
    expect(screen.queryByRole('button', { name: 'Role' })).not.toBeInTheDocument();
  });
});
