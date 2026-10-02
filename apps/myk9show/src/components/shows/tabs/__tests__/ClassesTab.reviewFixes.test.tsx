import { Link } from 'react-router-dom';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassesTab, type ClassInfo } from '../ClassesTab';

// MYK9-924 review round 3: one search (the toolbar's), focus that survives pagination and
// repeat visits, trials with no classes yet, a judge override that cannot revive, and `?view=mine`
// for a user who has no entries.

vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: 'resolved', canManage: true }),
}));
vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => true }) }));
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => ['table', vi.fn(), true],
  CARD_TABLE_MODES: [
    { key: 'cards', label: 'Cards', icon: 'grid' },
    { key: 'table', label: 'Table', icon: 'table' },
  ],
}));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: () => ({ data: { id: 's1', organization: 'AKC' } }),
}));
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({
    data: [
      {
        id: 'judge-1',
        firstName: 'Jane',
        lastName: 'Judge',
        judgeQualifications: [{ status: 'Active', organization: 'AKC' }],
      },
    ],
  }),
}));
vi.mock('@/services/database/judges', () => ({
  upsertClassJudgeAssignment: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/show-day/classStatusMutations', () => ({ applyManualClassStatus: vi.fn() }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

function makeClass(id: string, trialId: string, patch: Partial<ClassInfo> = {}): ClassInfo {
  return {
    id,
    name: `Class ${id}`,
    element: 'Containers',
    level: 'Novice',
    section: '',
    judgeName: '',
    trialId,
    trialDate: trialId === 't1' ? '2026-08-01' : '2026-08-02',
    trialNumber: trialId === 't1' ? '1' : '2',
    time: '9:00 AM',
    ring: 1,
    status: 'Scheduled',
    entryCount: 3,
    userHasEntry: false,
    ...patch,
  };
}

const classes = [
  makeClass('c1', 't1'),
  makeClass('c2', 't1', { element: 'Interior', level: 'Advanced' }),
  makeClass('c3', 't2', { element: 'Exterior' }),
];

const renderTab = (props: Partial<React.ComponentProps<typeof ClassesTab>> = {}) =>
  render(<ClassesTab classes={classes} showId="s1" userHasEntries={false} {...props} />);

const focusedId = () => {
  const el = document.activeElement as HTMLElement | null;
  return el?.dataset.classId ?? el?.dataset.rowId;
};

describe('ClassesTab review fixes', () => {
  beforeEach(() => {
    navigate.mockReset();
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  describe('one search', () => {
    it('renders no second search box inside the table', () => {
      renderTab();

      expect(screen.queryByRole('textbox', { name: 'Search table' })).not.toBeInTheDocument();
      expect(screen.getAllByPlaceholderText(/search/i)).toHaveLength(1);
    });

    it('select all reaches only the rows the search leaves visible', async () => {
      const { user } = renderTab();
      await user.type(screen.getByPlaceholderText('Search classes...'), 'Int');

      await user.click(screen.getByRole('checkbox', { name: 'Select all visible classes' }));

      expect(await screen.findByText('1 class selected')).toBeInTheDocument();
    });
  });

  describe('focus on a later page', () => {
    const many = Array.from({ length: 40 }, (_, i) => makeClass(`c${i + 1}`, 't1'));

    it('opens the page that holds the focused class before focusing it', async () => {
      renderTab({ classes: many, focusClassId: 'c30' });

      await waitFor(() => expect(focusedId()).toBe('c30'));
    });

    it('still focuses a class on the first page', async () => {
      renderTab({ classes: many, focusClassId: 'c3' });

      await waitFor(() => expect(focusedId()).toBe('c3'));
    });
  });

  describe('following the same focus link again', () => {
    it('refocuses the class on a new visit to the same ?focus=', async () => {
      const { user } = render(
        <>
          <ClassesTab classes={classes} showId="s1" userHasEntries={false} focusClassId="c2" />
          <Link to="/?again=1">again</Link>
        </>
      );
      await waitFor(() => expect(focusedId()).toBe('c2'));
      (document.activeElement as HTMLElement).blur();
      expect(focusedId()).toBeUndefined();

      await user.click(screen.getByRole('link', { name: 'again' }));

      await waitFor(() => expect(focusedId()).toBe('c2'));
    });
  });

  describe('focus beats a trial that does not hold the class', () => {
    it("switches to the focused class's trial", async () => {
      renderTab({ trialId: 't1', onTrialChange: vi.fn(), focusClassId: 'c3' });

      expect(screen.getByText('Exterior')).toBeInTheDocument();
      expect(screen.queryByText('Containers')).not.toBeInTheDocument();
      await waitFor(() => expect(focusedId()).toBe('c3'));
    });
  });

  describe('a trial with no classes yet', () => {
    const trials = [
      { id: 't1', trialDate: '2026-08-01', trialNumber: '1' },
      { id: 't2', trialDate: '2026-08-02', trialNumber: '2' },
      { id: 't3', trialDate: '2026-08-03', trialNumber: '3' },
    ];

    it('is kept in the trial picker', async () => {
      const { user } = renderTab({ trials });

      await user.click(screen.getByRole('combobox', { name: 'Trial' }));

      expect(await screen.findByRole('option', { name: /August 3/ })).toBeInTheDocument();
    });

    it('opens Add Classes on that trial', async () => {
      const { user } = renderTab({ trials, trialId: 't3', onTrialChange: vi.fn() });

      await user.click(screen.getByRole('button', { name: 'Add Classes' }));

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate.mock.calls[0]![0]).toContain('t3');
    });
  });

  describe('judge override', () => {
    const picker = () => screen.getByRole('combobox', { name: 'Judge for Class c1' });
    const withJudge = (judgeId?: string) =>
      classes.map(cls => (cls.id === 'c1' && judgeId ? { ...cls, judgeId } : cls));

    it('does not revive after the judge goes A -> B -> A', async () => {
      const { user, rerender } = renderTab();
      const again = (judgeId?: string) =>
        rerender(<ClassesTab classes={withJudge(judgeId)} showId="s1" userHasEntries={false} />);

      await user.click(picker());
      await user.click(await screen.findByRole('option', { name: 'Jane Judge' }));
      await waitFor(() => expect(picker()).toHaveTextContent('Jane Judge'));

      again('judge-1');
      await waitFor(() => expect(picker()).toHaveTextContent('Jane Judge'));

      again(undefined);
      await waitFor(() => expect(picker()).toHaveTextContent('Unassigned'));
    });
  });

  describe('?view=mine without entries', () => {
    it('reads as All, since the Mine view is hidden', () => {
      renderTab({ viewId: 'mine', onViewChange: vi.fn(), userHasEntries: false });

      expect(screen.getByText('Containers')).toBeInTheDocument();
      expect(screen.getByText('Interior')).toBeInTheDocument();
    });
  });
});
