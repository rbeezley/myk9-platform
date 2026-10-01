import { render, screen, within } from '@/test/utils/testUtils';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassManagementPage } from '../ClassManagementPage';

// MYK9-900: the row delete asks through DeleteClassDialog (the same dialog Class Details
// and Setup use), never window.confirm.

const useClassesByTrialQueryMock = vi.hoisted(() => vi.fn());
const useDeleteClassMutationMock = vi.hoisted(() => vi.fn());
const deleteMutate = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useClassesByTrialQuery: useClassesByTrialQueryMock,
  useUpdateClassMutation: () => ({ mutate: vi.fn() }),
  useDeleteClassMutation: useDeleteClassMutationMock,
  classKeys: {
    all: ['classes'],
    byTrial: (trialId: string) => ['classes', 'trial', trialId],
  },
}));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: () => ({ data: { id: 'show-1', status: 'published' } }),
}));
vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useSecretaryShowEntriesQuery: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment: vi.fn() }));
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
    status: 'scheduled',
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
    status: 'scheduled',
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

async function openDeleteFor(user: ReturnType<typeof renderPage>['user'], name: string) {
  await user.click(screen.getByRole('button', { name: `More actions for ${name}` }));
  await user.click(await screen.findByRole('menuitem', { name: /delete class/i }));
}

describe('ClassManagementPage row delete (MYK9-900)', () => {
  const confirmSpy = vi.spyOn(window, 'confirm');

  beforeEach(() => {
    deleteMutate.mockClear();
    confirmSpy.mockClear();
    confirmSpy.mockReturnValue(true);
    useClassesByTrialQueryMock.mockReturnValue({ data: classRows, isLoading: false });
    useDeleteClassMutationMock.mockReturnValue({ mutate: deleteMutate });
  });

  it('opens the Delete Class dialog instead of window.confirm, and deletes only on confirm', async () => {
    const { user } = renderPage();

    await openDeleteFor(user, 'Container Novice A');

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete Class')).toBeVisible();
    expect(within(dialog).getByText(/Container Novice A/)).toBeVisible();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(deleteMutate).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate).toHaveBeenCalledWith({ id: 'class-1' });
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('cancel closes the dialog without deleting', async () => {
    const { user } = renderPage();

    await openDeleteFor(user, 'Interior Novice A');
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
