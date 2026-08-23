import { vi } from 'vitest';
import defaultTheme from 'tailwindcss/defaultTheme';
import { render, screen } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import {
  RESPONSIVE_CLASSES,
  type ResponsiveBreakpoint,
} from '@/components/ui/data-table/types';
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

    // `getColumnLayoutClasses` is well covered on its own; its two CALL SITES
    // were not, so pointing the body cell at the header class set left the
    // suite green. The two sets differ by stacking order, which is what makes
    // the wiring observable.
    it('gives the header cell and the body cell their own class set', () => {
      const column = renderCells();
      const header = column('Name').header.className.split(/\s+/);
      const body = column('Name').cell.className.split(/\s+/);

      expect(header).toContain('z-20');
      expect(header).not.toContain('z-10');
      expect(body).toContain('z-10');
      expect(body).not.toContain('z-20');
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

  // The jsdom stylesheet trick above proves a column is hidden, but it CANNOT
  // prove at which width — jsdom discards `@media` wholesale, so `hidden
  // 2xl:table-cell` satisfies "display is none" exactly as `hidden
  // lg:table-cell` does, and the reviewer showed the whole suite stayed green
  // when the breakpoint was changed to `2xl`. These assert the breakpoint
  // itself, in device widths rather than in a class name.
  describe('the width at which Breed and Sex drop', () => {
    // The decision behind MYK9-222: a secretary on a tablet must not have to
    // scroll to reach Status. MYK9-222 measured iPad portrait.
    const TABLET_WIDTHS: ReadonlyArray<readonly [string, number]> = [
      ['iPad portrait', 768],
      ['iPad Air', 820],
      ['iPad Pro 11"', 834],
      ['Surface', 912],
    ];
    // Below this the column is hidden, at or above it the column renders, so
    // the breakpoint must not push past the narrowest ordinary desktop.
    const NARROWEST_DESKTOP = 1024;

    function breakpointOf(label: string): ResponsiveBreakpoint {
      render(<DogsTableView dogs={dogs} />);
      const th = Array.from(document.querySelectorAll('thead th')).find(h =>
        h.textContent?.trim().startsWith(label)
      );
      if (!th) throw new Error(`No "${label}" column header rendered`);
      const classes = th.className.split(/\s+/);
      const matched = (Object.keys(RESPONSIVE_CLASSES) as ResponsiveBreakpoint[]).filter(bp =>
        RESPONSIVE_CLASSES[bp].split(' ').every(c => classes.includes(c))
      );
      expect(matched).toHaveLength(1);
      return matched[0] as ResponsiveBreakpoint;
    }

    /** Minimum viewport width, in px, at which the column reappears. */
    function widthWhereVisible(label: string): number {
      const px = Number.parseInt(defaultTheme.screens[breakpointOf(label)], 10);
      expect(Number.isFinite(px)).toBe(true);
      return px;
    }

    it.each(['Breed', 'Sex'])('drops %s on every tablet width, not just on phones', label => {
      const visibleFrom = widthWhereVisible(label);
      for (const [device, width] of TABLET_WIDTHS) {
        expect({ device, width, hidden: width < visibleFrom }).toEqual({
          device,
          width,
          hidden: true,
        });
      }
    });

    it.each(['Breed', 'Sex'])('brings %s back on a desktop', label => {
      expect(widthWhereVisible(label)).toBeLessThanOrEqual(NARROWEST_DESKTOP);
    });

    it('does not drop Owner or Status at any width', () => {
      render(<DogsTableView dogs={dogs} />);
      for (const label of ['Name', 'Owner', 'Status']) {
        const th = Array.from(document.querySelectorAll('thead th')).find(h =>
          h.textContent?.trim().startsWith(label)
        );
        expect(th?.className.split(/\s+/)).not.toContain('hidden');
      }
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
