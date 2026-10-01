import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassManagementPage } from '../ClassManagementPage';

// MYK9-900 / CRUD standard Phase 2: the row delete asks through the one shared delete dialog
// (the same one Class Details, Setup and the trial page use), never window.confirm.

const useClassesByTrialQueryMock = vi.hoisted(() => vi.fn());
const deleteMocks = vi.hoisted(() => ({ preview: vi.fn(), remove: vi.fn(), purge: vi.fn() }));
vi.mock('@/features/delete/deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deletePreview')>()),
  fetchDeletePreview: deleteMocks.preview,
}));
vi.mock('@/features/delete/deleteServer', () => ({
  softDeleteOnServer: deleteMocks.remove,
  restoreOnServer: vi.fn(),
}));
vi.mock('@/features/delete/deleteLocalState', () => ({
  reconcileLocalDeletion: deleteMocks.purge,
}));

vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useClassesByTrialQuery: useClassesByTrialQueryMock,
  useUpdateClassMutation: () => ({ mutate: vi.fn() }),
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
    deleteMocks.preview.mockReset().mockResolvedValue({
      trials: 0,
      classes: 0,
      entries: 0,
      shows: 0,
      dogs: 0,
      paid: 0,
      scored: 0,
      blocking: 0,
    });
    deleteMocks.remove.mockReset().mockResolvedValue(undefined);
    deleteMocks.purge.mockReset().mockResolvedValue(undefined);
    confirmSpy.mockClear();
    confirmSpy.mockReturnValue(true);
    useClassesByTrialQueryMock.mockReturnValue({ data: classRows, isLoading: false });
  });

  it('opens the shared dialog instead of window.confirm, and deletes only on confirm', async () => {
    const { user } = renderPage();

    await openDeleteFor(user, 'Container Novice A');

    const dialog = await screen.findByRole('dialog', {
      name: 'Delete the class Container Novice A?',
    });
    expect(within(dialog).getByText('Novice Container · Saturday Trial')).toBeVisible();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(deleteMocks.remove).not.toHaveBeenCalled();

    const confirm = within(dialog).getByRole('button', { name: 'Delete class' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() => expect(deleteMocks.remove).toHaveBeenCalledTimes(1));
    expect(deleteMocks.remove).toHaveBeenCalledWith('class', 'class-1', { override: false });
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('stays open and says why when the delete fails', async () => {
    deleteMocks.remove.mockRejectedValue({ code: '42501', message: 'Permission denied' });
    const { user } = renderPage();

    await openDeleteFor(user, 'Container Novice A');
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete class' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "You don't have permission to delete this class."
    );
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('Keep it closes the dialog without deleting', async () => {
    const { user } = renderPage();

    await openDeleteFor(user, 'Interior Novice A');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));

    expect(deleteMocks.remove).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
