import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassManagementPage } from '../ClassManagementPage';

const useClassesByTrialQueryMock = vi.hoisted(() => vi.fn());
const useUpdateClassMutationMock = vi.hoisted(() => vi.fn());
const useDeleteClassMutationMock = vi.hoisted(() => vi.fn());
// Bulk delete reuses useDeleteClassMutation.mutateAsync per class (soft delete +
// full cache invalidations), same as single-class delete.
const deleteMutateAsyncMock = vi.hoisted(() => vi.fn());
const useJudgesWithQualificationsMock = vi.hoisted(() => vi.fn());
const useShowQueryMock = vi.hoisted(() => vi.fn());
const upsertClassJudgeAssignmentMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const updateClassMock = vi.hoisted(() => vi.fn());
const deleteClassMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useClassesByTrialQuery: useClassesByTrialQueryMock,
  useUpdateClassMutation: useUpdateClassMutationMock,
  useDeleteClassMutation: useDeleteClassMutationMock,
  classKeys: {
    all: ['classes'],
    byTrial: (trialId: string) => ['classes', 'trial', trialId],
  },
}));

vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: useJudgesWithQualificationsMock,
}));

// The page filters judges to the SHOW's organization, so the show has to exist here.
// Before that filter landed the list was organization-blind and this mock was not
// needed -- which is exactly how an AKC show came to offer UKC-only judges.
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: useShowQueryMock,
}));

vi.mock('@/services/database/judges', () => ({
  upsertClassJudgeAssignment: upsertClassJudgeAssignmentMock,
}));

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass: updateClassMock,
    // Bulk delete no longer uses the replicated hard-DELETE; it routes through the
    // soft_delete_class service RPC below. Keep a distinct fn to assert it's unused.
    deleteClass: vi.fn(),
  },
}));

// Bulk delete goes through the soft_delete_class service (recoverable), not the
// replicated table — `deleteClass` returns { data, error }.
vi.mock('@/services/database/classes', () => ({
  deleteClass: deleteClassMock,
}));

vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn() } }));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: (selector: (state: { getTrialById: (trialId: string) => unknown }) => unknown) =>
    selector({
      getTrialById: () => ({
        id: 'trial-1',
        showId: 'show-1',
        name: 'Saturday Trial',
      }),
    }),
}));

const classRows = [
  {
    id: 'class-1',
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'scheduled',
    class_order: 1,
    max_entries: 50,
    entries: [],
    judge_assignments: [],
  },
];

describe('ClassManagementPage judge assignment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastErrorMock.mockClear();
    useClassesByTrialQueryMock.mockReturnValue({ data: classRows, isLoading: false });
    useUpdateClassMutationMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    deleteMutateAsyncMock.mockResolvedValue({ id: 'class-1', name: null });
    useDeleteClassMutationMock.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: deleteMutateAsyncMock,
      isPending: false,
    });
    useShowQueryMock.mockReturnValue({ data: { id: 'show-1', organization: 'AKC' } });
    useJudgesWithQualificationsMock.mockReturnValue({
      data: [
        {
          id: 'judge-1',
          firstName: 'Alex',
          lastName: 'Judge',
          judgeQualifications: [{ status: 'Active', organization: 'AKC' }],
        },
        {
          id: 'judge-2',
          firstName: 'Bailey',
          lastName: 'Judge',
          judgeQualifications: [{ status: 'Active', organization: 'AKC' }],
        },
      ],
    });
    upsertClassJudgeAssignmentMock.mockResolvedValue(undefined);
    updateClassMock.mockResolvedValue('mutation-1');
    deleteClassMock.mockResolvedValue({ data: { id: 'class-1', name: null }, error: null });
  });

  it('does not offer a judge qualified for a DIFFERENT registry', async () => {
    // The regression this filter closes. `show.assignedJudges` is derived from
    // judge_assignments, so assigning here is what puts a judge on the show and onto
    // its registry paperwork -- offering a UKC-only judge on an AKC show is a write
    // path into the roster, not a cosmetic list problem.
    const user = userEvent.setup();
    useJudgesWithQualificationsMock.mockReturnValue({
      data: [
        {
          id: 'judge-akc',
          firstName: 'Alex',
          lastName: 'Judge',
          judgeQualifications: [{ status: 'Active', organization: 'AKC' }],
        },
        {
          id: 'judge-ukc',
          firstName: 'Bailey',
          lastName: 'Judge',
          judgeQualifications: [{ status: 'Active', organization: 'UKC' }],
        },
      ],
    });

    render(
      <Routes>
        <Route path="/trials/:trialId/classes" element={<ClassManagementPage />} />
      </Routes>,
      { initialRoute: '/trials/trial-1/classes' }
    );

    const row = screen.getByText('Container Novice A').closest('[data-class-id="class-1"]');
    await user.click(
      within(row as HTMLElement).getByRole('combobox', { name: /judge for container novice a/i })
    );

    expect(await screen.findByRole('option', { name: 'Alex Judge' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Bailey Judge' })).toBeNull();
  });

  it('renders inline judge assignment and writes the selected class judge', async () => {
    const user = userEvent.setup();

    render(
      <Routes>
        <Route path="/trials/:trialId/classes" element={<ClassManagementPage />} />
      </Routes>,
      { initialRoute: '/trials/trial-1/classes' }
    );

    const row = screen.getByText('Container Novice A').closest('[data-class-id="class-1"]');
    expect(row).not.toBeNull();
    const judgeSelect = within(row as HTMLElement).getByRole('combobox', {
      name: /judge for container novice a/i,
    });

    await user.click(judgeSelect);
    await user.click(await screen.findByRole('option', { name: 'Bailey Judge' }));

    await waitFor(() => {
      expect(upsertClassJudgeAssignmentMock).toHaveBeenCalledWith('show-1', 'class-1', 'judge-2');
    });
  });

  it('shows a visible error when judge assignment fails', async () => {
    const user = userEvent.setup();
    upsertClassJudgeAssignmentMock.mockRejectedValue(new Error('assignment failed'));

    render(
      <Routes>
        <Route path="/trials/:trialId/classes" element={<ClassManagementPage />} />
      </Routes>,
      { initialRoute: '/trials/trial-1/classes' }
    );

    const row = screen.getByText('Container Novice A').closest('[data-class-id="class-1"]');
    expect(row).not.toBeNull();
    const judgeSelect = within(row as HTMLElement).getByRole('combobox', {
      name: /judge for container novice a/i,
    });

    await user.click(judgeSelect);
    await user.click(await screen.findByRole('option', { name: 'Bailey Judge' }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  it('keeps the selection and does not clear it when a bulk delete fails', async () => {
    const user = userEvent.setup();
    deleteMutateAsyncMock.mockRejectedValue(new Error('delete failed'));

    render(
      <Routes>
        <Route path="/trials/:trialId/classes" element={<ClassManagementPage />} />
      </Routes>,
      { initialRoute: '/trials/trial-1/classes' }
    );

    await user.click(screen.getByRole('checkbox', { name: /select container novice a/i }));
    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete 1 of 1 selected/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(deleteMutateAsyncMock).toHaveBeenCalledWith({ id: 'class-1' }));
    // Failure keeps the row selected so the secretary can retry — no window.confirm anywhere.
    await waitFor(() => expect(screen.getByText('1 class selected')).toBeInTheDocument());
  });

  it('disables the bulk menu while a bulk delete is in flight (in-flight latch)', async () => {
    const user = userEvent.setup();
    let resolveDelete!: () => void;
    deleteMutateAsyncMock.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveDelete = () => resolve({ id: 'class-1', name: null });
        })
    );

    render(
      <Routes>
        <Route path="/trials/:trialId/classes" element={<ClassManagementPage />} />
      </Routes>,
      { initialRoute: '/trials/trial-1/classes' }
    );

    await user.click(screen.getByRole('checkbox', { name: /select container novice a/i }));
    await user.click(screen.getByRole('button', { name: /bulk class actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete 1 of 1 selected/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(deleteMutateAsyncMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /bulk class actions/i })).toBeDisabled();

    resolveDelete();
    await waitFor(() => expect(screen.queryByText(/selected/i)).not.toBeInTheDocument());
  });

  it('uses show-scoped workbench links instead of browser-history back navigation', () => {
    render(
      <Routes>
        <Route path="/shows/:id/classes/:trialId" element={<ClassManagementPage />} />
      </Routes>,
      { initialRoute: '/shows/show-1/classes/trial-1' }
    );

    expect(screen.getByRole('navigation', { name: 'Class management breadcrumb' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Show setup' })).toHaveAttribute(
      'href',
      '/shows/show-1/setup'
    );
    expect(screen.getByRole('link', { name: 'Back to Setup' })).toHaveAttribute(
      'href',
      '/shows/show-1/setup'
    );
    expect(screen.getByRole('link', { name: 'Back to Setup' })).toHaveClass(
      'min-h-[44px]',
      'w-full',
      'sm:w-auto'
    );
    expect(screen.getByRole('link', { name: 'Manage Waitlist' })).toHaveAttribute(
      'href',
      '/shows/show-1/entry-management?tab=waitlist&trial=trial-1'
    );
    expect(screen.getByRole('link', { name: 'Manage Waitlist' })).toHaveClass(
      'min-h-[44px]',
      'w-full',
      'sm:w-auto'
    );
    expect(screen.getByRole('link', { name: 'Add Classes' })).toHaveAttribute(
      'href',
      '/shows/show-1/classes/trial-1/create'
    );
    expect(screen.getByRole('link', { name: 'Add Classes' })).toHaveClass(
      'min-h-[44px]',
      'w-full',
      'sm:w-auto'
    );
    expect(screen.getByText('Saturday Trial')).toHaveClass('truncate');
    expect(screen.getByText('Saturday Trial')).toHaveAttribute('title', 'Saturday Trial');
    expect(screen.queryByRole('button', { name: 'Back to Trial' })).not.toBeInTheDocument();

    const classRow = screen.getByText('Container Novice A').closest('[data-class-id="class-1"]');
    expect(classRow).toHaveClass('border', 'rounded-lg');
    expect(classRow?.querySelector('.manager-class-row-grid')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Add Classes' }).parentElement).toHaveClass(
      'manager-page-actions'
    );
  });
});
