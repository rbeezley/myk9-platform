import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from '@/components/common/FilterBar/FilterBar';
import type {
  FilterBarState,
  FilterDefinition,
  FilterBarProps,
} from '@/components/common/FilterBar/types';

// Mock Popover to render inline (avoids Portal issues in jsdom)
vi.mock('@/components/ui/popover', () => ({
  Popover: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div data-testid="popover" data-open={open} onClick={() => onOpenChange?.(!open)}>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="popover-trigger">{asChild ? children : children}</div>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

// Mock FilterPill to a simple stub that exposes key props
vi.mock('@/components/common/FilterBar/FilterPill', () => ({
  FilterPill: ({
    definition,
    value,
    onChange,
    onRemove,
  }: {
    definition: FilterDefinition;
    value: unknown;
    onChange: (v: unknown) => void;
    onRemove: () => void;
  }) => (
    <div data-testid={`filter-pill-${definition.key}`}>
      <span>{definition.label}</span>
      <span data-testid={`filter-value-${definition.key}`}>{String(value)}</span>
      <button data-testid={`filter-change-${definition.key}`} onClick={() => onChange('changed')}>
        change
      </button>
      <button data-testid={`filter-remove-${definition.key}`} onClick={onRemove}>
        remove
      </button>
    </div>
  ),
}));

// Mock SortPill
vi.mock('@/components/common/FilterBar/SortPill', () => ({
  SortPill: () => <div data-testid="sort-pill">Sort</div>,
}));

// -- Helpers --

const makeFilterDefs = (count = 3): FilterDefinition[] =>
  Array.from({ length: count }, (_, i) => ({
    key: `filter${i}`,
    label: `Filter ${i}`,
    type: 'text' as const,
  }));

const selectDef: FilterDefinition = {
  key: 'status',
  label: 'Status',
  type: 'select',
  options: [
    { label: 'Active', value: 'active' },
    { label: 'Inactive', value: 'inactive' },
  ],
};

const multiSelectDef: FilterDefinition = {
  key: 'tags',
  label: 'Tags',
  type: 'multi-select',
  options: [
    { label: 'A', value: 'a' },
    { label: 'B', value: 'b' },
  ],
};

const booleanDef: FilterDefinition = {
  key: 'verified',
  label: 'Verified',
  type: 'boolean',
};

const emptyState: FilterBarState = {
  filters: {},
  sortKey: null,
  sortDirection: 'asc',
};

function renderFilterBar(overrides: Partial<FilterBarProps> = {}) {
  const onStateChange = vi.fn();
  const props: FilterBarProps = {
    filterDefs: makeFilterDefs(),
    state: emptyState,
    onStateChange,
    ...overrides,
  };
  const result = render(<FilterBar {...props} />);
  return { ...result, onStateChange, props };
}

// -- Tests --

describe('FilterBar', () => {
  describe('Rendering filter definitions', () => {
    it('should render the "Add Filter" button when definitions exist', () => {
      renderFilterBar();
      const addButton = screen
        .getAllByRole('button')
        .find(b => b.getAttribute('aria-haspopup') === 'listbox');
      expect(addButton).toBeDefined();
    });

    it('should list available filters in the add-filter popover', () => {
      renderFilterBar();
      // The popover content renders inline due to the mock
      expect(screen.getByText('Filter 0')).toBeInTheDocument();
      expect(screen.getByText('Filter 1')).toBeInTheDocument();
      expect(screen.getByText('Filter 2')).toBeInTheDocument();
    });

    it('should render FilterPill for each active filter', () => {
      const defs = makeFilterDefs(2);
      const state: FilterBarState = {
        filters: { filter0: 'hello', filter1: 'world' },
        sortKey: null,
        sortDirection: 'asc',
      };
      renderFilterBar({ filterDefs: defs, state });

      expect(screen.getByTestId('filter-pill-filter0')).toBeInTheDocument();
      expect(screen.getByTestId('filter-pill-filter1')).toBeInTheDocument();
    });

    it('should not show inactive filters as pills', () => {
      const defs = makeFilterDefs(2);
      const state: FilterBarState = {
        filters: { filter0: 'hello' },
        sortKey: null,
        sortDirection: 'asc',
      };
      renderFilterBar({ filterDefs: defs, state });

      expect(screen.getByTestId('filter-pill-filter0')).toBeInTheDocument();
      expect(screen.queryByTestId('filter-pill-filter1')).not.toBeInTheDocument();
    });

    it('should render with mixed filter types', () => {
      const defs = [selectDef, multiSelectDef, booleanDef];
      const state: FilterBarState = {
        filters: { status: 'active', tags: ['a'], verified: true },
        sortKey: null,
        sortDirection: 'asc',
      };
      renderFilterBar({ filterDefs: defs, state });

      expect(screen.getByTestId('filter-pill-status')).toBeInTheDocument();
      expect(screen.getByTestId('filter-pill-tags')).toBeInTheDocument();
      expect(screen.getByTestId('filter-pill-verified')).toBeInTheDocument();
    });
  });

  describe('Active filter count and Clear All', () => {
    it('should not show "Clear all" when no filters are active', () => {
      renderFilterBar();
      expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
    });

    it('should show "Clear all" when filters are active', () => {
      const state: FilterBarState = {
        filters: { filter0: 'test' },
        sortKey: null,
        sortDirection: 'asc',
      };
      renderFilterBar({ filterDefs: makeFilterDefs(), state });
      expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument();
    });

    it('should call onStateChange with empty filters when "Clear all" is clicked', async () => {
      const user = userEvent.setup();
      const state: FilterBarState = {
        filters: { filter0: 'a', filter1: 'b' },
        sortKey: 'name',
        sortDirection: 'desc',
      };
      const { onStateChange } = renderFilterBar({ filterDefs: makeFilterDefs(), state });

      await user.click(screen.getByRole('button', { name: /clear all/i }));

      expect(onStateChange).toHaveBeenCalledWith({
        filters: {},
        sortKey: 'name',
        sortDirection: 'desc',
      });
    });

    it('should preserve sort state when clearing filters', async () => {
      const user = userEvent.setup();
      const state: FilterBarState = {
        filters: { filter0: 'val' },
        sortKey: 'date',
        sortDirection: 'desc',
      };
      const { onStateChange } = renderFilterBar({ filterDefs: makeFilterDefs(), state });

      await user.click(screen.getByRole('button', { name: /clear all/i }));

      const call = onStateChange.mock.calls[0][0] as FilterBarState;
      expect(call.sortKey).toBe('date');
      expect(call.sortDirection).toBe('desc');
      expect(call.filters).toEqual({});
    });
  });

  describe('onStateChange callbacks', () => {
    it('should call onStateChange when a filter value changes via FilterPill', async () => {
      const user = userEvent.setup();
      const state: FilterBarState = {
        filters: { filter0: 'original' },
        sortKey: null,
        sortDirection: 'asc',
      };
      const { onStateChange } = renderFilterBar({ filterDefs: makeFilterDefs(), state });

      await user.click(screen.getByTestId('filter-change-filter0'));

      expect(onStateChange).toHaveBeenCalledWith({
        filters: { filter0: 'changed' },
        sortKey: null,
        sortDirection: 'asc',
      });
    });

    it('should call onStateChange to remove a filter', async () => {
      const user = userEvent.setup();
      const state: FilterBarState = {
        filters: { filter0: 'val0', filter1: 'val1' },
        sortKey: null,
        sortDirection: 'asc',
      };
      const { onStateChange } = renderFilterBar({ filterDefs: makeFilterDefs(), state });

      await user.click(screen.getByTestId('filter-remove-filter0'));

      const call = onStateChange.mock.calls[0][0] as FilterBarState;
      expect(call.filters).toEqual({ filter1: 'val1' });
      expect(call.filters).not.toHaveProperty('filter0');
    });

    it('should add a filter with default value when clicking an available filter', async () => {
      const user = userEvent.setup();
      const { onStateChange } = renderFilterBar();

      // Click a filter name in the add-filter popover list
      await user.click(screen.getByText('Filter 0'));

      expect(onStateChange).toHaveBeenCalledTimes(1);
      const call = onStateChange.mock.calls[0][0] as FilterBarState;
      expect(call.filters).toHaveProperty('filter0');
      // text type default is ''
      expect(call.filters.filter0).toBe('');
    });

    it('should NOT auto-apply a value for select type (pending pill awaits user pick)', async () => {
      const user = userEvent.setup();
      const { onStateChange } = renderFilterBar({ filterDefs: [selectDef] });

      await user.click(screen.getByText('Status'));

      // Adding a select filter should NOT call onStateChange — the pill is
      // pending until the user picks an option. This guards against the
      // regression where clicking "Role" in the People filter list silently
      // applied the alphabetically-first option.
      expect(onStateChange).not.toHaveBeenCalled();
    });

    it('should NOT auto-apply a value for multi-select type', async () => {
      const user = userEvent.setup();
      const { onStateChange } = renderFilterBar({ filterDefs: [multiSelectDef] });

      await user.click(screen.getByText('Tags'));

      // Same pending-pill behavior as select.
      expect(onStateChange).not.toHaveBeenCalled();
    });

    it('should set correct default for boolean type', async () => {
      const user = userEvent.setup();
      const { onStateChange } = renderFilterBar({ filterDefs: [booleanDef] });

      await user.click(screen.getByText('Verified'));

      const call = onStateChange.mock.calls[0][0] as FilterBarState;
      expect(call.filters.verified).toBe(true);
    });
  });

  describe('Empty definitions', () => {
    it('should render without crashing when filterDefs is empty', () => {
      const { container } = renderFilterBar({ filterDefs: [] });
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should not show "Add Filter" button when no definitions exist', () => {
      renderFilterBar({ filterDefs: [] });
      expect(screen.queryByRole('button', { name: /filter/i })).not.toBeInTheDocument();
    });

    it('should not show "Clear all" button when no definitions and no state', () => {
      renderFilterBar({ filterDefs: [] });
      expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
    });
  });

  describe('Add Filter button visibility', () => {
    it('should hide the "Add Filter" button when all filters are already active', () => {
      const defs = makeFilterDefs(2);
      const state: FilterBarState = {
        filters: { filter0: 'a', filter1: 'b' },
        sortKey: null,
        sortDirection: 'asc',
      };
      renderFilterBar({ filterDefs: defs, state });

      // All filters are active — no available filters to add
      // The button should not be present since availableToAdd is empty
      const buttons = screen.queryAllByRole('button', { name: /filter/i });
      // There should be no "Filter" add button — only "Clear all"
      const addFilterButton = buttons.find(b => b.textContent?.trim().toLowerCase() === 'filter');
      expect(addFilterButton).toBeUndefined();
    });

    it('should show only unadded filters in the popover', () => {
      const defs = makeFilterDefs(3);
      const state: FilterBarState = {
        filters: { filter0: 'active' },
        sortKey: null,
        sortDirection: 'asc',
      };
      renderFilterBar({ filterDefs: defs, state });

      // filter0 is active so it appears in a FilterPill, not in the add list.
      // The add-filter popover buttons are inside popover-content.
      const popoverContent = screen.getByTestId('popover-content');
      const addOptionButtons = popoverContent.querySelectorAll('button');
      const labels = Array.from(addOptionButtons).map(b => b.textContent);
      expect(labels).not.toContain('Filter 0');
      expect(labels).toContain('Filter 1');
      expect(labels).toContain('Filter 2');
    });
  });

  describe('Sort pill', () => {
    it('should render SortPill when sortDefs are provided', () => {
      renderFilterBar({
        sortDefs: [{ key: 'name', label: 'Name' }],
      });
      expect(screen.getByTestId('sort-pill')).toBeInTheDocument();
    });

    it('should not render SortPill when sortDefs is undefined', () => {
      renderFilterBar();
      expect(screen.queryByTestId('sort-pill')).not.toBeInTheDocument();
    });

    it('should not render SortPill when sortDefs is empty', () => {
      renderFilterBar({ sortDefs: [] });
      expect(screen.queryByTestId('sort-pill')).not.toBeInTheDocument();
    });
  });

  describe('className prop', () => {
    it('should apply custom className to the root element', () => {
      const { container } = renderFilterBar({ className: 'custom-class' });
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});
