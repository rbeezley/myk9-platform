import {
  captureCsvDownload,
  registeredPageExports,
  resetPageExports,
} from '@/test/utils/csvDownload';
import { render, screen, within } from '@/test/utils/testUtils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassesTab, type ClassInfo } from '../ClassesTab';

// MYK9-929: the Classes tab follows the shared list rules. The real `useViewPreference` runs here
// (localStorage). Every reader opens on cards, even one who holds entries; the toggle sits in the
// result line; every row opens the one class-detail URL. Managers never reach this tab: they land
// on the show home, whose schedule manages classes (MYK9-1324/1337).

// Signed in by default; a guest test sets this to null.
let mockUser: { id: string } | null = { id: 'u1' };
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: mockUser }),
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

function makeClass(id: string, patch: Partial<ClassInfo> = {}): ClassInfo {
  return {
    id,
    name: `Class ${id}`,
    element: 'Containers',
    level: 'Novice',
    section: '',
    judgeName: '',
    trialId: 't1',
    trialDate: '2026-08-01',
    trialNumber: '1',
    time: '9:00 AM',
    ring: 1,
    status: 'Scheduled',
    entryCount: 3,
    userHasEntry: false,
    ...patch,
  };
}

const classes = [makeClass('c1'), makeClass('c2', { element: 'Interior', level: 'Advanced' })];

const renderTab = (userHasEntries = false, rows: ClassInfo[] = classes) =>
  render(<ClassesTab classes={rows} showId="s1" userHasEntries={userHasEntries} />);

describe('ClassesTab list toolkit', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUser = { id: 'u1' };
    navigate.mockReset();
  });

  describe('toolbar contents', () => {
    it('has the search, the result sentence and the toggle, and no manage controls', () => {
      renderTab();

      expect(screen.getByPlaceholderText('Search classes...')).toBeInTheDocument();
      const resultLine = screen.getByRole('status').parentElement as HTMLElement;
      expect(resultLine).toHaveTextContent('Showing all 2 classes.');
      expect(within(resultLine).getByRole('button', { name: 'Cards view' })).toBeInTheDocument();
      expect(within(resultLine).getByRole('button', { name: 'Table view' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /columns|export|density|reset/i })).toBeNull();
      expect(screen.queryByRole('combobox', { name: 'Trial' })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: 'Element' })).not.toBeInTheDocument();
    });
  });

  describe('default view by role, and her own choice remembered', () => {
    it('opens an exhibitor on cards, even one who holds entries in the show', () => {
      const { container } = renderTab(true);
      expect(container.querySelector('table')).toBeNull();
      expect(screen.getAllByText('Containers').length).toBeGreaterThan(0);
    });

    it('opens a visitor on cards', () => {
      const { container } = renderTab(false);
      expect(container.querySelector('table')).toBeNull();
    });

    it('remembers the choice on the next visit', async () => {
      const first = renderTab();
      await first.user.click(screen.getByRole('button', { name: 'Table view' }));
      expect(first.container.querySelector('table')).not.toBeNull();
      expect(localStorage.getItem('view-pref-classes')).toBe('table');
      first.unmount();

      const second = renderTab();
      expect(second.container.querySelector('table')).not.toBeNull();
    });
  });

  describe('one empty state', () => {
    it('says "No classes yet" for a show with none', () => {
      renderTab(false, []);
      expect(screen.getByRole('heading', { name: 'No classes yet' })).toBeInTheDocument();
    });

    it('says one filtered wording with "Show all classes"', async () => {
      const { user } = renderTab();
      await user.type(screen.getByPlaceholderText('Search classes...'), 'zzzz');
      expect(
        screen.getByRole('heading', { name: 'No classes match your search or filters.' })
      ).toBeInTheDocument();
      await user.click(screen.getAllByRole('button', { name: 'Show all classes' })[0]!);
      expect(screen.getByRole('status')).toHaveTextContent('Showing all 2 classes.');
    });
  });

  describe('every class row opens the one class-detail URL', () => {
    it('from the table', async () => {
      localStorage.setItem('view-pref-classes', 'table');
      const { user } = renderTab();
      await user.click(screen.getByText('Interior'));
      expect(navigate).toHaveBeenCalledWith('/shows/s1/trials/t1/classes/c2');
    });

    it('from a card', async () => {
      const { user } = renderTab();
      await user.click(screen.getByText('Interior'));
      expect(navigate).toHaveBeenCalledWith('/shows/s1/trials/t1/classes/c2');
    });
  });

  describe('Export CSV page action (the table button it replaced)', () => {
    afterEach(() => {
      resetPageExports();
    });

    it('registers one in the table view that exports the whole list, no ticking needed', () => {
      localStorage.setItem('view-pref-classes', 'table');
      renderTab();
      const registered = registeredPageExports();
      expect(registered.map(item => item.id)).toEqual(['classes']);

      const download = captureCsvDownload();
      try {
        registered[0]!.run();
        const lines = download.csv().split('\n');
        expect(lines[0]).toBe('Trial,Element,Level,Section,Judge,Time,Ring,Status,Entries');
        expect(lines).toHaveLength(3);
      } finally {
        download.restore();
      }
    });

    it('registers nothing in cards view', () => {
      renderTab();
      expect(registeredPageExports()).toEqual([]);
    });
  });

  // MYK9-933: a signed-out visitor has no header Actions menu, so the export is in the result line.
  describe('guest Export CSV', () => {
    beforeEach(() => {
      mockUser = null;
    });

    it('shows in the result line in cards view and downloads the table columns', async () => {
      const { user } = renderTab();
      const resultLine = screen.getByRole('status').parentElement as HTMLElement;
      const download = captureCsvDownload();
      try {
        await user.click(within(resultLine).getByRole('button', { name: 'Export CSV' }));
        const lines = download.csv().split('\n');
        expect(lines[0]).toBe('Trial,Element,Level,Section,Judge,Time,Ring,Status,Entries');
        expect(lines).toHaveLength(classes.length + 1);
      } finally {
        download.restore();
      }
    });

    it('leaves Ring out where the public table hides it (scent trials)', async () => {
      const { user } = render(
        <ClassesTab classes={classes} showId="s1" userHasEntries={false} hideRing />
      );
      const download = captureCsvDownload();
      try {
        await user.click(screen.getByRole('button', { name: 'Export CSV' }));
        expect(download.csv().split('\n')[0]).toBe(
          'Trial,Element,Level,Section,Judge,Time,Status,Entries'
        );
      } finally {
        download.restore();
      }
    });

    it('is absent for a signed-in reader', () => {
      mockUser = { id: 'u1' };
      renderTab();
      expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
    });
  });

  describe('one search, found by every value the columns show', () => {
    const searchRows = [
      makeClass('c1', {
        element: 'Containers',
        level: 'Novice',
        section: 'A',
        judgeName: 'Jane Judge',
        status: 'Scheduled',
        time: '9:00 AM',
        ring: 1,
        entryCount: 4,
      }),
      makeClass('c2', {
        element: 'Interior',
        level: 'Open',
        section: 'B',
        judgeName: 'Joe Judge',
        status: 'Completed',
        time: '1:30 PM',
        ring: 2,
        entryCount: 11,
        userHasEntry: true,
      }),
    ];
    const cases: Array<[string, string, string]> = [
      ['element', 'Interior', 'Interior'],
      ['level and section', 'Novice A', 'Containers'],
      ['judge', 'Joe Judge', 'Interior'],
      ['status label', 'Completed', 'Interior'],
      ['status label (not started)', 'Not started', 'Containers'],
      ['time', '1:30 PM', 'Interior'],
      ['entry count', '11', 'Interior'],
      // Word order and column boundaries do not matter: every word must be found somewhere.
      ['element and level+section', 'Containers Novice A', 'Containers'],
      ['reordered', 'novice a containers', 'Containers'],
      ['element and section letter', 'Containers A', 'Containers'],
      ['status and element', 'Completed Interior', 'Interior'],
      ['a name-only token', 'c2', 'Interior'],
    ];

    describe('as a reader', () => {
      it.each(cases)('%s', async (_label, query, expected) => {
        localStorage.setItem('view-pref-classes', 'table');
        const { user } = renderTab(false, searchRows);
        await user.type(screen.getByPlaceholderText('Search classes...'), query);
        expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 2 classes.');
        expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
      });

      it('has exactly one search box, and the export matches the rows on screen', async () => {
        localStorage.setItem('view-pref-classes', 'table');
        const { user } = renderTab(false, searchRows);
        expect(screen.getAllByPlaceholderText(/search/i)).toHaveLength(1);
        await user.type(screen.getByPlaceholderText('Search classes...'), 'Joe Judge');

        const download = captureCsvDownload();
        try {
          registeredPageExports()[0]!.run();
          const lines = download.csv().split('\n');
          expect(lines).toHaveLength(2);
          expect(lines[1]).toContain('"Interior"');
        } finally {
          download.restore();
          resetPageExports();
        }
      });
    });
  });
});
