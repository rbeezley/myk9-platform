import { Link } from 'react-router-dom';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAddClassesHref } from '@/pages/secretary/ShowCreationWizard/addClassesHref';
import { usePageEditTargetStore } from '@/features/actions/pageEditTarget';
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
      {
        id: 'judge-2',
        firstName: 'Joe',
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

    // Migrated from "opens Add Classes on that trial" (MYK9-928): the toolbar button became the
    // header Actions menu's show-wide "Add classes", which must still open on the picked trial.
    it("hands the picked trial to the header Actions menu's Add classes, and takes it back on leave", () => {
      usePageEditTargetStore.setState({ addClassesTrialId: null });
      const { unmount } = renderTab({ trials, trialId: 't3', onTrialChange: vi.fn() });

      expect(usePageEditTargetStore.getState().addClassesTrialId).toBe('t3');

      unmount();
      expect(usePageEditTargetStore.getState().addClassesTrialId).toBeNull();
    });

    it('keeps the requested trial when the whole show has no classes', async () => {
      const { user } = renderTab({ classes: [], trials, trialId: 't2', onTrialChange: vi.fn() });

      await user.click(screen.getByRole('button', { name: 'Add Classes' }));

      expect(navigate).toHaveBeenCalledWith(getAddClassesHref('s1', 't2'));
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

  // The picker shows the judge on the store row it is handed (after `mergeTrialClassData`), so
  // each change another device or a remount makes must reach the picker.
  describe('judge picker follows the class row', () => {
    const picker = () => screen.getByRole('combobox', { name: 'Judge for Class c1' });
    const rowJudgedBy = (judgeId?: string) =>
      classes.map(cls => (cls.id === 'c1' && judgeId ? { ...cls, judgeId } : cls));
    const tabWith = (judgeId?: string) => (
      <ClassesTab classes={rowJudgedBy(judgeId)} showId="s1" userHasEntries={false} />
    );

    it('shows Unassigned when a remote update clears the judge', async () => {
      const { rerender } = renderTab({ classes: rowJudgedBy('judge-1') });
      await waitFor(() => expect(picker()).toHaveTextContent('Jane Judge'));

      rerender(tabWith(undefined));

      await waitFor(() => expect(picker()).toHaveTextContent('Unassigned'));
    });

    it('keeps a local clear across a remount, and a later reassignment still shows', async () => {
      const { user, unmount } = renderTab({ classes: rowJudgedBy('judge-1') });
      await user.click(picker());
      await user.click(await screen.findByRole('option', { name: 'Unassigned' }));
      await waitFor(() => expect(picker()).toHaveTextContent('Unassigned'));
      unmount();

      const second = renderTab({ classes: rowJudgedBy(undefined) });
      await waitFor(() => expect(picker()).toHaveTextContent('Unassigned'));

      second.rerender(tabWith('judge-1'));
      await waitFor(() => expect(picker()).toHaveTextContent('Jane Judge'));
    });

    it('follows a reassignment from another device, A -> B -> A', async () => {
      const { rerender } = renderTab({ classes: rowJudgedBy('judge-1') });
      await waitFor(() => expect(picker()).toHaveTextContent('Jane Judge'));

      rerender(tabWith('judge-2'));
      await waitFor(() => expect(picker()).toHaveTextContent('Joe Judge'));

      rerender(tabWith('judge-1'));
      await waitFor(() => expect(picker()).toHaveTextContent('Jane Judge'));
    });

    it('shows A again after a LOCAL clear and then another device re-assigns A', async () => {
      const { user, rerender } = renderTab({ classes: rowJudgedBy('judge-1') });
      await user.click(picker());
      await user.click(await screen.findByRole('option', { name: 'Unassigned' }));
      await waitFor(() => expect(picker()).toHaveTextContent('Unassigned'));

      rerender(tabWith(undefined));
      await waitFor(() => expect(picker()).toHaveTextContent('Unassigned'));
      rerender(tabWith('judge-1'));

      await waitFor(() => expect(picker()).toHaveTextContent('Jane Judge'));
    });
  });

  describe('judge override on a class the secretary has since hidden', () => {
    const picker = () => screen.getByRole('combobox', { name: 'Judge for Class c1' });
    const rowJudgedBy = (judgeId?: string) =>
      classes.map(cls => (cls.id === 'c1' && judgeId ? { ...cls, judgeId } : cls));
    const tabWith = (judgeId?: string) => (
      <ClassesTab classes={rowJudgedBy(judgeId)} showId="s1" userHasEntries={false} />
    );

    it('shows A after: A cleared, class hidden, another device reassigns A, class unhidden', async () => {
      const { user, rerender } = renderTab({ classes: rowJudgedBy('judge-1') });
      await user.click(picker());
      await user.click(await screen.findByRole('option', { name: 'Unassigned' }));
      await waitFor(() => expect(picker()).toHaveTextContent('Unassigned'));

      // Hide c1 (it does not match), let replication catch up, then another device assigns A.
      const search = screen.getByPlaceholderText('Search classes...');
      await user.type(search, 'Interior');
      expect(screen.queryByText('Class c1')).not.toBeInTheDocument();
      rerender(tabWith(undefined));
      rerender(tabWith('judge-1'));
      await user.clear(search);

      await waitFor(() => expect(picker()).toHaveTextContent('Jane Judge'));
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
