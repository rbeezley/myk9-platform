import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassManagementPage } from '../ClassManagementPage';

// Slice 2 (2.2-2.5): local useState selection replaced with useBulkSelection
// (pruneToItems: true) + a header/indeterminate checkbox, and bulk status/delete
// route through replicatedClassesTable via useBulkDispatch's allSettled fold +
// in-flight latch. See openspec/changes/inline-bulk-actions-and-editable-status.

const useClassesByTrialQueryMock = vi.hoisted(() => vi.fn());
const useUpdateClassMutationMock = vi.hoisted(() => vi.fn());
const useDeleteClassMutationMock = vi.hoisted(() => vi.fn());
const useJudgesWithQualificationsMock = vi.hoisted(() => vi.fn());
const useShowQueryMock = vi.hoisted(() => vi.fn());
const updateClassMock = vi.hoisted(() => vi.fn());
const deleteClassMock = vi.hoisted(() => vi.fn());
// Bulk delete routes through the soft_delete_class service RPC (same recoverable
// path as single-class delete), NOT the replicated table's raw hard DELETE.
const softDeleteClassServiceMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useClassesByTrialQuery: useClassesByTrialQueryMock,
  useUpdateClassMutation: useUpdateClassMutationMock,
  useDeleteClassMutation: useDeleteClassMutationMock,
  classKeys: {
    all: ['classes'],
    byTrial: (trialId: string) => ['classes', 'trial', trialId],
  },
}));

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: useShowQueryMock,
}));

vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: useJudgesWithQualificationsMock,
}));

vi.mock('@/services/database/judges', () => ({
  upsertClassJudgeAssignment: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass: updateClassMock,
    deleteClass: deleteClassMock,
  },
}));

vi.mock('@/services/database/classes', () => ({
  deleteClass: softDeleteClassServiceMock,
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: (selector: (state: { getTrialById: (trialId: string) => unknown }) => unknown) =>
    selector({
      getTrialById: () => ({ id: 'trial-1', showId: 'show-1', name: 'Saturday Trial' }),
    }),
}));

const classRows = [
  {
    id: 'class-1',
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'Scheduled',
    class_order: 1,
    max_entries: 50,
    entries: [],
    judge_assignments: [],
  },
  {
    id: 'class-2',
    name: 'Interior Novice A',
    element: 'Interior',
    level: 'Novice',
    section: 'A',
    status: 'Scheduled',
    class_order: 2,
    max_entries: 50,
    entries: [],
    judge_assignments: [],
  },
];

function renderPage() {
  return render(
    <Routes>
      <Route path="/shows/:id/classes/:trialId" element={<ClassManagementPage />} />
    </Routes>,
    { initialRoute: '/shows/show-1/classes/trial-1' }
  );
}

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest('[data-class-id]');
  if (!row) throw new Error(`row not found for ${name}`);
  return row as HTMLElement;
}

describe('ClassManagementPage bulk selection (2.2-2.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useClassesByTrialQueryMock.mockReturnValue({ data: classRows, isLoading: false });
    useUpdateClassMutationMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useDeleteClassMutationMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useJudgesWithQualificationsMock.mockReturnValue({ data: [] });
    useShowQueryMock.mockReturnValue({ data: { id: 'show-1', status: 'published' } });
    updateClassMock.mockResolvedValue('mutation-1');
    deleteClassMock.mockResolvedValue('mutation-1');
    softDeleteClassServiceMock.mockResolvedValue({
      data: { id: 'class-1', name: null },
      error: null,
    });
  });

  it('does not render the removed "Select all filtered" button', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /select all filtered/i })).not.toBeInTheDocument();
  });

  it('header checkbox selects all visible classes and shows the bulk bar', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('checkbox', { name: /select all visible classes/i }));

    expect(screen.getByText('2 classes selected')).toBeInTheDocument();
    expect(within(rowFor('Container Novice A')).getByRole('checkbox')).toBeChecked();
    expect(within(rowFor('Interior Novice A')).getByRole('checkbox')).toBeChecked();
  });

  it('header checkbox is indeterminate when only some rows are selected', async () => {
    const { user } = renderPage();
    await user.click(
      within(rowFor('Container Novice A')).getByRole('checkbox', { name: /select container/i })
    );

    const header = screen.getByRole('checkbox', { name: /select all visible classes/i });
    expect(header).toHaveAttribute('aria-checked', 'mixed');
    expect(header).toHaveAttribute('data-indeterminate');
  });

  it('prunes a selected row from the count once it is filtered out', async () => {
    const { user } = renderPage();
    await user.click(
      within(rowFor('Container Novice A')).getByRole('checkbox', { name: /select container/i })
    );
    await user.click(
      within(rowFor('Interior Novice A')).getByRole('checkbox', { name: /select interior/i })
    );
    expect(screen.getByText('2 classes selected')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search classes...'), 'Interior');

    expect(screen.getByText('1 class selected')).toBeInTheDocument();
    expect(screen.queryByText('Container Novice A')).not.toBeInTheDocument();
  });

  it('dispatches a bulk status change through replicatedClassesTable.updateClass for each selected class', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('checkbox', { name: /select all visible classes/i }));

    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    await user.click(
      await screen.findByRole('menuitem', { name: /set to in progress — 2 of 2 selected/i })
    );

    expect(updateClassMock).toHaveBeenCalledWith('class-1', { classStatus: 'In Progress' });
    expect(updateClassMock).toHaveBeenCalledWith('class-2', { classStatus: 'In Progress' });
    // Selection clears on full success.
    await waitFor(() => expect(screen.queryByText(/selected/i)).not.toBeInTheDocument());
  });

  it('bulk delete soft-deletes via the service RPC, not the replicated hard DELETE', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('checkbox', { name: /select all visible classes/i }));

    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete 2 of 2 selected/i }));

    // Destructive → confirmation dialog before dispatch.
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(softDeleteClassServiceMock).toHaveBeenCalledWith('class-1');
      expect(softDeleteClassServiceMock).toHaveBeenCalledWith('class-2');
    });
    // The raw hard-delete path must NOT be used — it would cascade-delete entries
    // irrecoverably and diverge from single-class soft-delete semantics.
    expect(deleteClassMock).not.toHaveBeenCalled();
  });

  it('a second click while a bulk dispatch is in flight is a no-op (in-flight latch)', async () => {
    const resolvers: Array<() => void> = [];
    updateClassMock.mockImplementation(
      () =>
        new Promise(resolve => {
          resolvers.push(() => resolve('mutation-1'));
        })
    );

    const { user } = renderPage();
    await user.click(screen.getByRole('checkbox', { name: /select all visible classes/i }));

    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    const menuItem = await screen.findByRole('menuitem', {
      name: /set to in progress — 2 of 2 selected/i,
    });
    await user.click(menuItem);

    // Bulk controls are disabled while busy, so a second dispatch cannot fire.
    expect(screen.getByRole('button', { name: /bulk class actions/i })).toBeDisabled();
    expect(updateClassMock).toHaveBeenCalledTimes(2);

    resolvers.forEach(resolve => resolve());
    await waitFor(() => expect(screen.queryByText(/selected/i)).not.toBeInTheDocument());
  });
});
