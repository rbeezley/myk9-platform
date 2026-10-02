import { render, screen, within } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassesTab, type ClassInfo } from '../ClassesTab';

// MYK9-929: Setup → Classes follows the shared list rules. The real `useViewPreference` runs here
// (localStorage). A manager opens on the table, an exhibitor on cards even when she holds
// entries; the toggle sits in the result line for every reader; every row opens the one
// class-detail URL.

let mockCanManage = true;
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: 'resolved', canManage: mockCanManage }),
}));
vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => true }) }));
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: () => ({ data: { id: 's1', organization: 'AKC' } }),
}));
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment: vi.fn() }));
vi.mock('@/services/show-day/classStatusMutations', () => ({ applyManualClassStatus: vi.fn() }));

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
    mockCanManage = true;
    navigate.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  describe('toolbar contents', () => {
    it('a manager gets search, the element filter, the result sentence and the toggle in it', () => {
      renderTab();

      expect(screen.getByPlaceholderText('Search classes...')).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Element' })).toBeInTheDocument();
      const resultLine = screen.getByRole('status').parentElement as HTMLElement;
      expect(resultLine).toHaveTextContent('Showing all 2 classes.');
      expect(within(resultLine).getByRole('button', { name: 'Cards view' })).toBeInTheDocument();
      expect(within(resultLine).getByRole('button', { name: 'Table view' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /columns|export|density|reset/i })).toBeNull();
    });

    it('a reader gets the same result line and toggle, and no manage controls', () => {
      mockCanManage = false;
      renderTab();

      const resultLine = screen.getByRole('status').parentElement as HTMLElement;
      expect(resultLine).toHaveTextContent('Showing all 2 classes.');
      expect(within(resultLine).getByRole('button', { name: 'Table view' })).toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: 'Trial' })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: 'Element' })).not.toBeInTheDocument();
    });
  });

  describe('default view by role, and her own choice remembered', () => {
    it('opens a manager on the table', () => {
      const { container } = renderTab();
      expect(container.querySelector('table')).not.toBeNull();
    });

    it('opens an exhibitor on cards, even one who holds entries in the show', () => {
      mockCanManage = false;
      const { container } = renderTab(true);
      expect(container.querySelector('table')).toBeNull();
      expect(screen.getAllByText('Containers').length).toBeGreaterThan(0);
    });

    it('opens a visitor on cards', () => {
      mockCanManage = false;
      const { container } = renderTab(false);
      expect(container.querySelector('table')).toBeNull();
    });

    it('remembers the choice on the next visit', async () => {
      const first = renderTab();
      await first.user.click(screen.getByRole('button', { name: 'Cards view' }));
      expect(first.container.querySelector('table')).toBeNull();
      expect(localStorage.getItem('view-pref-classes')).toBe('cards');
      first.unmount();

      const second = renderTab();
      expect(second.container.querySelector('table')).toBeNull();
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
      const { user } = renderTab();
      await user.click(screen.getByText('Interior'));
      expect(navigate).toHaveBeenCalledWith('/shows/s1/trials/t1/classes/c2');
    });

    it('from a card', async () => {
      localStorage.setItem('view-pref-classes', 'cards');
      const { user } = renderTab();
      await user.click(screen.getByText('Interior'));
      expect(navigate).toHaveBeenCalledWith('/shows/s1/trials/t1/classes/c2');
    });
  });
});
