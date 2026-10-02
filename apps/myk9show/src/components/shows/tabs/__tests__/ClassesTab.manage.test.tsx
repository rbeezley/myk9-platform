import { render, screen, within } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassesTab, type ClassInfo } from '../ClassesTab';

// MYK9-924: judge assignment and bulk class status moved here from the retired Class Management
// page. Managers get a judge picker and a select checkbox per class plus the bulk bar; everyone
// else gets the read-only tab.

let mockCanManage = true;
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({
    status: 'resolved',
    canManage: mockCanManage,
  }),
}));
vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => true }) }));
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));

let mockViewMode = 'table';
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => [
    mockViewMode,
    (mode: string) => {
      mockViewMode = mode;
    },
    true,
  ],
  CARD_TABLE_MODES: [
    { key: 'cards', label: 'Cards', icon: 'grid' },
    { key: 'table', label: 'Table', icon: 'table' },
  ],
}));

const showQuery = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useShowsDatabase', () => ({ useShowQuery: showQuery }));

const judgesQuery = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: judgesQuery,
}));

const upsertClassJudgeAssignment = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment }));

const applyManualClassStatus = vi.hoisted(() => vi.fn());
vi.mock('@/services/show-day/classStatusMutations', () => ({ applyManualClassStatus }));

const JUDGE = {
  id: 'judge-1',
  firstName: 'Jane',
  lastName: 'Judge',
  judgeQualifications: [{ status: 'Active', organization: 'AKC' }],
};
const UKC_ONLY_JUDGE = {
  id: 'judge-2',
  firstName: 'Uma',
  lastName: 'Ukc',
  judgeQualifications: [{ status: 'Active', organization: 'UKC' }],
};

const classes: ClassInfo[] = [
  {
    id: 'c1',
    name: 'Novice Containers',
    element: 'Containers',
    level: 'Novice',
    section: 'A',
    judgeName: '',
    trialId: 't1',
    time: '9:00 AM',
    ring: 1,
    status: 'Scheduled',
    entryCount: 28,
    userHasEntry: false,
  },
  {
    id: 'c2',
    name: 'Advanced Interior',
    element: 'Interior',
    level: 'Advanced',
    section: 'B',
    judgeName: '',
    trialId: 't1',
    time: '10:30 AM',
    ring: 1,
    status: 'Scheduled',
    entryCount: 12,
    userHasEntry: false,
  },
];

const renderTab = (props: Partial<React.ComponentProps<typeof ClassesTab>> = {}) =>
  render(<ClassesTab classes={classes} showId="s1" userHasEntries={false} {...props} />);

describe.each(['table', 'cards'])('ClassesTab manager controls (%s view)', view => {
  beforeEach(() => {
    mockCanManage = true;
    mockViewMode = view;
    showQuery.mockReturnValue({ data: { id: 's1', organization: 'AKC' } });
    judgesQuery.mockReturnValue({ data: [JUDGE, UKC_ONLY_JUDGE] });
    upsertClassJudgeAssignment.mockReset();
    upsertClassJudgeAssignment.mockResolvedValue(undefined);
    applyManualClassStatus.mockReset();
    applyManualClassStatus.mockResolvedValue(undefined);
  });

  it('assigns the picked judge to that class only', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('combobox', { name: 'Judge for Advanced Interior' }));
    await user.click(await screen.findByRole('option', { name: 'Jane Judge' }));

    expect(upsertClassJudgeAssignment).toHaveBeenCalledTimes(1);
    expect(upsertClassJudgeAssignment).toHaveBeenCalledWith('s1', 'c2', 'judge-1');
  });

  it("offers only judges qualified for the show's registry", async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('combobox', { name: 'Judge for Advanced Interior' }));

    expect(await screen.findByRole('option', { name: 'Jane Judge' })).toBeVisible();
    expect(screen.queryByRole('option', { name: 'Uma Ukc' })).not.toBeInTheDocument();
  });

  it('marks every selected class with the chosen status from the bulk bar', async () => {
    const { user } = renderTab();

    await user.click(screen.getByRole('checkbox', { name: 'Select Novice Containers' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Advanced Interior' }));
    const bar = await screen.findByRole('toolbar', { name: 'Bulk actions' });
    await user.click(within(bar).getByRole('button', { name: 'Change status' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Mark 2 of 2 Completed' }));

    expect(applyManualClassStatus).toHaveBeenCalledTimes(2);
    expect(applyManualClassStatus).toHaveBeenCalledWith('c1', 'Completed');
    expect(applyManualClassStatus).toHaveBeenCalledWith('c2', 'Completed');
  });

  it('shows no bulk bar until something is selected', () => {
    renderTab();
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).not.toBeInTheDocument();
  });

  it('offers a non-manager neither the judge picker nor selection', () => {
    mockCanManage = false;
    renderTab();

    expect(screen.queryByRole('combobox', { name: /^Judge for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /^Select / })).not.toBeInTheDocument();
    expect(judgesQuery).toHaveBeenCalledWith(false);
  });
});

describe('ClassesTab opening view', () => {
  beforeEach(() => {
    mockCanManage = true;
    mockViewMode = 'table';
    showQuery.mockReturnValue({ data: { id: 's1', organization: 'AKC' } });
    judgesQuery.mockReturnValue({ data: [] });
  });

  it('shows the view the Setup URL asked for', () => {
    renderTab({
      viewId: 'completed',
      onViewChange: vi.fn(),
      classes: [{ ...classes[0]!, status: 'Completed' }, classes[1]!],
    });

    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.queryByText('Interior')).not.toBeInTheDocument();
  });
});
