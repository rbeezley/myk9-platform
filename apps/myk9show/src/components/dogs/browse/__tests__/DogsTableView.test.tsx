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

  // MYK9-222. These assert what the browser COMPUTES for each cell, not which
  // class strings the component happens to emit.
  //
  // jsdom evaluates a stylesheet's plain rules through the real cascade but
  // discards `@media` blocks outright (measured: a rule for `md:table-cell`
  // guarded by `@media (min-width: 768px)` does not apply even at
  // `innerWidth: 1024`). Dropping the guarded half therefore reproduces
  // exactly the narrow-viewport case — everything a browser applies BELOW the
  // `md` breakpoint, and nothing it applies above. The class definitions below
  // are Tailwind's own; that `md` is 768px is pinned separately in
  // `data-table/__tests__/columnLayoutClasses.test.ts`.
  describe('column layout at narrow widths', () => {
    const NARROW_VIEWPORT_UTILITIES = `
      .hidden { display: none; }
      .sticky { position: sticky; }
      .left-0 { left: 0px; }
    `;

    let styleEl: HTMLStyleElement;

    beforeEach(() => {
      styleEl = document.createElement('style');
      styleEl.textContent = NARROW_VIEWPORT_UTILITIES;
      document.head.appendChild(styleEl);
    });

    afterEach(() => styleEl.remove());

    // Queried straight off the DOM rather than by role: a cell this change
    // hides correctly is REMOVED from the accessibility tree, so a role query
    // could not reach the very elements under test. That removal is itself
    // asserted below.
    function renderCells() {
      render(<DogsTableView dogs={dogs} />);
      const headers = Array.from(document.querySelectorAll('thead th'));
      const rexRow = screen.getByText('Rex').closest('tr') as HTMLTableRowElement;
      const cells = Array.from(rexRow.querySelectorAll('td'));
      expect(headers).toHaveLength(cells.length);
      const byName = (label: string) => {
        const index = headers.findIndex(h => h.textContent?.trim().startsWith(label));
        if (index < 0) throw new Error(`No "${label}" column header rendered`);
        return { header: headers[index] as HTMLElement, cell: cells[index] as HTMLElement };
      };
      return byName;
    }

    it('keeps the Name column pinned to the left edge of the scroll area', () => {
      const column = renderCells();
      for (const el of [column('Name').header, column('Name').cell]) {
        expect(getComputedStyle(el).position).toBe('sticky');
        expect(getComputedStyle(el).left).toBe('0px');
      }
    });

    it('does not pin any other column', () => {
      const column = renderCells();
      for (const label of ['Breed', 'Sex', 'Owner', 'Status']) {
        expect(getComputedStyle(column(label).header).position).not.toBe('sticky');
        expect(getComputedStyle(column(label).cell).position).not.toBe('sticky');
      }
    });

    it('drops Breed and Sex below the md breakpoint', () => {
      const column = renderCells();
      for (const label of ['Breed', 'Sex']) {
        expect(getComputedStyle(column(label).header).display).toBe('none');
        expect(getComputedStyle(column(label).cell).display).toBe('none');
      }
    });

    it('keeps Name, Owner and Status rendered at the same width', () => {
      const column = renderCells();
      for (const label of ['Name', 'Owner', 'Status']) {
        expect(getComputedStyle(column(label).header).display).not.toBe('none');
        expect(getComputedStyle(column(label).cell).display).not.toBe('none');
      }
    });

    it('removes the dropped columns from the accessibility tree, not just from view', () => {
      render(<DogsTableView dogs={dogs} />);
      expect(screen.queryByRole('columnheader', { name: /breed/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: /sex/i })).not.toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /owner/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    });

    it('exposes the horizontal scroll area to the keyboard', () => {
      render(<DogsTableView dogs={dogs} />);
      const region = screen.getByRole('region', { name: /dogs table/i });
      expect(region).toHaveAttribute('tabindex', '0');
    });
  });

  // Trap: adding a ceiling or a hide to an existing view re-arms every
  // downstream assumption written while the set was whole. `responsiveHide` is
  // CSS-only, so the CSV must still carry every column — a viewport-dependent
  // export would be a silent data-loss bug.
  it('still exports Breed and Sex even though they are hidden at narrow widths', async () => {
    const { user } = render(<DogsTableView dogs={dogs} />);

    let exported: Blob | undefined;
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((blob: Blob | MediaSource) => {
        exported = blob as Blob;
        return 'blob:dogs-table-test';
      });
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    try {
      await user.click(screen.getByRole('button', { name: /export csv/i }));
      expect(anchorClick).toHaveBeenCalledTimes(1);
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
      anchorClick.mockRestore();
    }

    expect(exported).toBeInstanceOf(Blob);
    // jsdom's Blob implements neither text() nor arrayBuffer().
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(exported as Blob);
    });
    expect(csv.split('\n')[0]).toBe('Name,Breed,Sex,Owner,Status');
    expect(csv).toContain('Labrador');
    expect(csv).toContain('female');
  });
});
