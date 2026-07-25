import { vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import { DogsTableView, type DogsTableSelection } from '../DogsTableView';

const dogs: Dog[] = [
  { id: '1', name: 'Rex', callName: 'Rex', breed: 'Labrador', sex: 'male', status: 'active' },
  { id: '2', name: 'Bella', callName: 'Bella', breed: 'Poodle', sex: 'female', status: 'active' },
] as unknown as Dog[];

function makeSelection(overrides: Partial<DogsTableSelection> = {}): DogsTableSelection {
  return {
    isSelected: () => false,
    toggleItem: vi.fn(),
    isAllSelected: false,
    isPartiallySelected: false,
    toggleAll: vi.fn(),
    ...overrides,
  };
}

describe('DogsTableView', () => {
  beforeEach(() => localStorage.clear());

  // The page-level ListControls owns the only search box; the table must not
  // render a second, redundant global-filter search of its own.
  it('does not render a built-in search box', () => {
    render(<DogsTableView dogs={dogs} />);
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
  });

  it('still exposes the column-visibility toggle', () => {
    render(<DogsTableView dogs={dogs} />);
    expect(screen.getByRole('button', { name: /toggle columns/i })).toBeInTheDocument();
  });

  describe('selection column', () => {
    it('renders no select column when selection is not provided', () => {
      render(<DogsTableView dogs={dogs} />);
      expect(screen.queryByRole('checkbox', { name: /select all dogs/i })).not.toBeInTheDocument();
    });

    it('renders a select-all header and per-row checkboxes when selection is provided', () => {
      render(<DogsTableView dogs={dogs} selection={makeSelection()} />);
      expect(screen.getByRole('checkbox', { name: /select all dogs/i })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /select rex/i })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /select bella/i })).toBeInTheDocument();
    });

    it('toggleAll fires from the header checkbox', async () => {
      const toggleAll = vi.fn();
      const { user } = render(
        <DogsTableView dogs={dogs} selection={makeSelection({ toggleAll })} />
      );
      await user.click(screen.getByRole('checkbox', { name: /select all dogs/i }));
      expect(toggleAll).toHaveBeenCalledTimes(1);
    });

    it('toggleItem fires for the clicked row and does not trigger the row-click navigation', async () => {
      const toggleItem = vi.fn();
      const { user } = render(
        <DogsTableView dogs={dogs} selection={makeSelection({ toggleItem })} />
      );
      await user.click(screen.getByRole('checkbox', { name: /select rex/i }));
      expect(toggleItem).toHaveBeenCalledTimes(1);
      expect(toggleItem).toHaveBeenCalledWith(dogs[0]);
    });

    it('reflects indeterminate state on the header checkbox', () => {
      render(
        <DogsTableView dogs={dogs} selection={makeSelection({ isPartiallySelected: true })} />
      );
      const header = screen.getByRole('checkbox', { name: /select all dogs/i });
      expect(header).toHaveAttribute('aria-checked', 'mixed');
    });
  });
});
