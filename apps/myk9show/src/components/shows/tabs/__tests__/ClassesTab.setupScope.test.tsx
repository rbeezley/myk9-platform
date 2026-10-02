import { render, screen, waitFor } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassesTab, type ClassInfo } from '../ClassesTab';

// MYK9-924 review round 2: what the retired Class Management page did that Setup → Classes now
// does too: one trial at a time, search and element filter, a status change and the waitlist in
// the row menu, run order, and a deep link that lands on its class.

let mockCanManage = true;
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: 'resolved', canManage: mockCanManage }),
}));
vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => true }) }));
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));

let mockViewMode = 'table';
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => [mockViewMode, vi.fn(), true],
  CARD_TABLE_MODES: [
    { key: 'cards', label: 'Cards', icon: 'grid' },
    { key: 'table', label: 'Table', icon: 'table' },
  ],
}));

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: () => ({ data: { id: 's1', organization: 'AKC' } }),
}));
const judgesQuery = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: judgesQuery,
}));
const upsertClassJudgeAssignment = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment }));
const applyManualClassStatus = vi.hoisted(() => vi.fn());
vi.mock('@/services/show-day/classStatusMutations', () => ({ applyManualClassStatus }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const judge = (id: string, firstName: string) => ({
  id,
  firstName,
  lastName: 'Judge',
  judgeQualifications: [{ status: 'Active', organization: 'AKC' }],
});

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
  makeClass('c1', 't1', { classOrder: 7 }),
  makeClass('c2', 't1', { element: 'Interior', level: 'Advanced', status: 'In Progress' }),
  makeClass('c3', 't2', { element: 'Exterior' }),
];

const renderTab = (props: Partial<React.ComponentProps<typeof ClassesTab>> = {}) =>
  render(<ClassesTab classes={classes} showId="s1" userHasEntries={false} {...props} />);

describe('ClassesTab Setup scope', () => {
  beforeEach(() => {
    mockCanManage = true;
    mockViewMode = 'table';
    judgesQuery.mockReturnValue({ data: [judge('judge-1', 'Jane'), judge('judge-2', 'Joe')] });
    upsertClassJudgeAssignment.mockReset();
    upsertClassJudgeAssignment.mockResolvedValue(undefined);
    applyManualClassStatus.mockReset();
    applyManualClassStatus.mockResolvedValue(undefined);
    navigate.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  describe('one trial at a time', () => {
    it("opens on the show's first trial and lists only its classes", () => {
      renderTab();

      expect(screen.getByText('Containers')).toBeInTheDocument();
      expect(screen.getByText('Interior')).toBeInTheDocument();
      expect(screen.queryByText('Exterior')).not.toBeInTheDocument();
    });

    it('opens on the trial the URL names', () => {
      renderTab({ trialId: 't2', onTrialChange: vi.fn() });

      expect(screen.getByText('Exterior')).toBeInTheDocument();
      expect(screen.queryByText('Containers')).not.toBeInTheDocument();
    });

    it('falls back to the first trial when the URL names one the show does not have', () => {
      renderTab({ trialId: 'gone', onTrialChange: vi.fn() });

      expect(screen.getByText('Containers')).toBeInTheDocument();
    });

    it('moves to the picked trial through the URL', async () => {
      const onTrialChange = vi.fn();
      const { user } = renderTab({ trialId: 't1', onTrialChange });

      await user.click(screen.getByRole('combobox', { name: 'Trial' }));
      await user.click(await screen.findByRole('option', { name: /August 2/ }));

      expect(onTrialChange).toHaveBeenCalledWith('t2');
    });

    it('gives a reader the whole show: no trial picker, no search, every trial listed', () => {
      mockCanManage = false;
      renderTab();

      expect(screen.queryByRole('combobox', { name: 'Trial' })).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Search classes...')).not.toBeInTheDocument();
      expect(screen.getByText('Exterior')).toBeInTheDocument();
      expect(screen.getByText('Containers')).toBeInTheDocument();
    });
  });

  describe('search and element filter', () => {
    it('narrows by the search text and says how many remain', async () => {
      const { user } = renderTab();
      expect(screen.getByRole('status')).toHaveTextContent('Showing all 2 classes.');

      await user.type(screen.getByPlaceholderText('Search classes...'), 'Int');

      expect(screen.queryByText('Containers')).not.toBeInTheDocument();
      expect(screen.getByText('Interior')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 2 classes.');
    });

    it('narrows by element, with a count for each element', async () => {
      const { user } = renderTab();

      await user.click(screen.getByRole('combobox', { name: /Element/ }));
      await user.click(await screen.findByRole('option', { name: 'Interior (1)' }));

      expect(screen.queryByText('Containers')).not.toBeInTheDocument();
      expect(screen.getByText('Interior')).toBeInTheDocument();
    });

    it('"Show all" puts the search, element and view back', async () => {
      const { user } = renderTab();
      await user.type(screen.getByPlaceholderText('Search classes...'), 'zz');
      expect(screen.getByRole('status')).toHaveTextContent('Showing 0 of 2 classes.');

      await user.click(screen.getAllByRole('button', { name: /show all classes/i })[0]!);

      expect(screen.getByPlaceholderText('Search classes...')).toHaveValue('');
      expect(screen.getByRole('status')).toHaveTextContent('Showing all 2 classes.');
    });
  });

  describe('views follow the URL', () => {
    it('shows the view it is given, the in-progress one included', () => {
      renderTab({ viewId: 'in_progress', onViewChange: vi.fn() });

      expect(screen.getByText('Interior')).toBeInTheDocument();
      expect(screen.queryByText('Containers')).not.toBeInTheDocument();
    });

    it('asks the URL to change when a view is picked, and shows the new one once it does', async () => {
      const onViewChange = vi.fn();
      const { user, rerender } = renderTab({ viewId: 'all', onViewChange });

      await user.click(screen.getByRole('combobox', { name: 'Show: Class views' }));
      await user.click(await screen.findByRole('option', { name: /^In progress/ }));
      expect(onViewChange).toHaveBeenCalledWith('in_progress');
      expect(screen.getByText('Containers')).toBeInTheDocument();

      rerender(
        <ClassesTab
          classes={classes}
          showId="s1"
          userHasEntries={false}
          viewId="in_progress"
          onViewChange={onViewChange}
        />
      );
      expect(screen.queryByText('Containers')).not.toBeInTheDocument();
    });
  });

  describe.each(['table', 'cards'])('row menu and order (%s view)', view => {
    beforeEach(() => {
      mockViewMode = view;
    });

    it('changes one class to the picked status', async () => {
      const { user } = renderTab();

      await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Set to Completed' }));

      await waitFor(() => expect(applyManualClassStatus).toHaveBeenCalledTimes(1));
      expect(applyManualClassStatus).toHaveBeenCalledWith('c1', 'Completed');
    });

    it('offers no change to the status the class already has', async () => {
      const { user } = renderTab();

      await user.click(screen.getByRole('button', { name: 'Class actions for Containers Novice' }));

      await screen.findByRole('menuitem', { name: 'Set to Completed' });
      expect(screen.queryByRole('menuitem', { name: 'Set to Scheduled' })).not.toBeInTheDocument();
    });

    it("opens the class's trial waitlist", async () => {
      const { user } = renderTab();

      await user.click(screen.getByRole('button', { name: 'Class actions for Interior Advanced' }));
      await user.click(await screen.findByRole('menuitem', { name: 'View waitlist' }));

      expect(navigate).toHaveBeenCalledWith('/shows/s1/entries?tab=waitlist&trial=t1');
    });

    it('shows the class order, and only for a class that has one', () => {
      renderTab();

      expect(screen.getAllByText('Order: 7')).toHaveLength(1);
      expect(screen.queryByText(/^Order: (?!7)/)).not.toBeInTheDocument();
    });
  });

  describe.each(['table', 'cards'])('deep link focus (%s view)', view => {
    beforeEach(() => {
      mockViewMode = view;
    });

    it('scrolls to the class named by ?focus= and focuses it', async () => {
      renderTab({ focusClassId: 'c2' });

      await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
      const focused = document.activeElement as HTMLElement;
      expect(focused.dataset.classId ?? focused.dataset.rowId).toBe('c2');
    });

    it('does nothing when no class is named', () => {
      renderTab();

      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });
  });

  describe('judge picker follows the class row', () => {
    const pickerOf = (name: string) => screen.getByRole('combobox', { name });
    const withJudge = (judgeId?: string) =>
      classes.map(cls => (cls.id === 'c1' && judgeId ? { ...cls, judgeId } : cls));
    const rerenderWith = (rerender: (ui: React.ReactElement) => void, judgeId?: string) =>
      rerender(<ClassesTab classes={withJudge(judgeId)} showId="s1" userHasEntries={false} />);

    it('shows the judge just assigned before the store catches up', async () => {
      const { user } = renderTab();

      await user.click(pickerOf('Judge for Class c1'));
      await user.click(await screen.findByRole('option', { name: 'Jane Judge' }));

      await waitFor(() => expect(pickerOf('Judge for Class c1')).toHaveTextContent('Jane Judge'));
    });

    it("shows another secretary's change instead of the stale assignment", async () => {
      const { user, rerender } = renderTab();
      await user.click(pickerOf('Judge for Class c1'));
      await user.click(await screen.findByRole('option', { name: 'Jane Judge' }));
      await waitFor(() => expect(pickerOf('Judge for Class c1')).toHaveTextContent('Jane Judge'));

      rerenderWith(rerender, 'judge-2');

      await waitFor(() => expect(pickerOf('Judge for Class c1')).toHaveTextContent('Joe Judge'));
    });

    it('shows the row once it has caught up with the assignment', async () => {
      const { user, rerender } = renderTab();
      await user.click(pickerOf('Judge for Class c1'));
      await user.click(await screen.findByRole('option', { name: 'Jane Judge' }));
      await waitFor(() => expect(pickerOf('Judge for Class c1')).toHaveTextContent('Jane Judge'));

      rerenderWith(rerender, 'judge-1');

      await waitFor(() => expect(pickerOf('Judge for Class c1')).toHaveTextContent('Jane Judge'));
    });
  });
});
