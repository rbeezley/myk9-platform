import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassManagementPage } from '../ClassManagementPage';

const useClassesByTrialQueryMock = vi.hoisted(() => vi.fn());
const useUpdateClassMutationMock = vi.hoisted(() => vi.fn());
const useDeleteClassMutationMock = vi.hoisted(() => vi.fn());
const useJudgesWithQualificationsMock = vi.hoisted(() => vi.fn());
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
    useDeleteClassMutationMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useJudgesWithQualificationsMock.mockReturnValue({
      data: [
        {
          id: 'judge-1',
          firstName: 'Alex',
          lastName: 'Judge',
          judgeQualifications: [{ status: 'Active' }],
        },
        {
          id: 'judge-2',
          firstName: 'Bailey',
          lastName: 'Judge',
          judgeQualifications: [{ status: 'Active' }],
        },
      ],
    });
    upsertClassJudgeAssignmentMock.mockResolvedValue(undefined);
    updateClassMock.mockResolvedValue('mutation-1');
    deleteClassMock.mockResolvedValue({ data: { id: 'class-1', name: null }, error: null });
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
    deleteClassMock.mockRejectedValue(new Error('delete failed'));

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

    await waitFor(() => expect(deleteClassMock).toHaveBeenCalledWith('class-1'));
    // Failure keeps the row selected so the secretary can retry — no window.confirm anywhere.
    await waitFor(() => expect(screen.getByText('1 class selected')).toBeInTheDocument());
  });

  it('disables the bulk menu while a bulk delete is in flight (in-flight latch)', async () => {
    const user = userEvent.setup();
    let resolveDelete!: () => void;
    deleteClassMock.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveDelete = () => resolve('mutation-1');
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

    await waitFor(() => expect(deleteClassMock).toHaveBeenCalledTimes(1));
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
  });
});
