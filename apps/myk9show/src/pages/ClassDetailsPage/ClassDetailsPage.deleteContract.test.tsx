import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import type { ClassData } from '@/components/classes/types/classTypes';

// MYK9-900: a failed delete must not navigate away from a class that still exists, and a failed
// save must reject into the panel (which keeps the user's edits open). Delete is the shared
// DeleteObjectDialog (CRUD standard Phase 2); only its server and device halves are mocked.

const mockUseClassDetailsData = vi.hoisted(() => vi.fn());
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
// The page opens the delete dialog from its menu; these tests start with it open.
vi.mock('./useClassDetailsDialogs', () => ({
  useClassDetailsDialogs: () => ({
    editClassPanelOpen: true,
    setEditClassPanelOpen: vi.fn(),
    openEditClassPanel: vi.fn(),
    closeEditClassPanel: vi.fn(),
    deleteDialogOpen: true,
    setDeleteDialogOpen: vi.fn(),
    openDeleteDialog: vi.fn(),
    closeDeleteDialog: vi.fn(),
    deleteEntryDialogOpen: false,
    setDeleteEntryDialogOpen: vi.fn(),
    entryToDelete: null,
    setEntryToDelete: vi.fn(),
    openDeleteEntryDialog: vi.fn(),
    closeDeleteEntryDialog: vi.fn(),
  }),
}));
const updateClass = vi.hoisted(() => vi.fn());
let mockConnectionHint: string | undefined;

vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => mockConnectionHint }));
vi.mock('./useClassDetailsData', () => ({ useClassDetailsData: mockUseClassDetailsData }));
vi.mock('./useMyEntriesInClass', () => ({
  useMyEntriesInClass: () => ({ myEntries: [], isAfterClass: false }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'secretary-1' } }),
}));
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment: vi.fn() }));
vi.mock('@/components/common/PageShell', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/common/PageHeader', () => ({ PageHeader: () => null }));
vi.mock('@/components/classes/ClassCompactHeader', () => ({
  ClassCompactHeader: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
}));
vi.mock('@/components/classes/ClassDetailsMain', () => ({ default: () => null }));
vi.mock('./SecretaryRunSheet', () => ({ SecretaryRunSheet: () => null }));
vi.mock('@/components/classes/ClassRequirementsPanel', () => ({
  ClassRequirementsPanel: () => null,
}));
// The panel exposes the page's save callback the way the real component calls it.
vi.mock('@/components/panels/edit/ClassEditPanel', () => ({
  ClassEditPanel: ({ onSave }: { onSave: (data: Partial<ClassData>) => Promise<void> }) => (
    <button
      type="button"
      onClick={() => {
        onSave({ judge: 'New Judge' }).then(
          () => {
            document.body.dataset.saveResult = 'resolved';
          },
          () => {
            document.body.dataset.saveResult = 'rejected';
          }
        );
      }}
    >
      save-class
    </button>
  ),
}));

import ClassDetailsPage from './index';

const currentClass: ClassData = {
  id: 'class-1',
  trialId: 'trial-1',
  trial: 'Saturday Trial 1',
  trialDate: '2026-05-22',
  trialNumber: '1',
  classOrder: '1',
  status: 'In Progress',
  judge: 'Judge Judy',
  className: 'Interior Novice A',
  element: 'Interior',
  level: 'Novice',
  section: 'A',
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
  return render(
    <>
      <ClassDetailsPage />
      <LocationProbe />
    </>,
    { initialRoute: '/shows/show-1/trials/trial-1/classes/class-1' }
  );
}

describe('ClassDetailsPage delete / save failure contract', () => {
  beforeEach(() => {
    mockConnectionHint = undefined;
    delete document.body.dataset.saveResult;
    deleteMocks.preview.mockReset().mockResolvedValue({
      trials: 0,
      classes: 0,
      entries: 2,
      shows: 0,
      dogs: 0,
      paid: 0,
      scored: 0,
      blocking: 0,
    });
    deleteMocks.remove.mockReset().mockResolvedValue(undefined);
    deleteMocks.purge.mockReset().mockResolvedValue(undefined);
    updateClass.mockReset();
    mockUseClassDetailsData.mockReturnValue({
      classId: 'class-1',
      trialId: 'trial-1',
      isResultsView: false,
      classes: [currentClass],
      currentClass,
      trialClasses: [currentClass],
      localRawEntries: [],
      dbRawEntries: [],
      classEntries: [],
      entriesLoading: false,
      entriesError: null,
      manageScope: {
        status: 'resolved',
        canManage: true,
        canOperate: true,
        hasOperationalStaffRole: true,
        clubId: 'club-1',
      },
      parentTrial: { id: 'trial-1', showId: 'show-1', trialNumber: 'Saturday Trial 1' },
      parentShow: { id: 'show-1', name: 'Spring Classic', organization: 'AKC', clubId: 'club-1' },
      dogs: [],
      updateClass,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function pressDelete(user: ReturnType<typeof renderPage>['user']) {
    const dialog = await screen.findByRole('dialog', {
      name: 'Delete the class Interior Novice A?',
    });
    const confirm = within(dialog).getByRole('button', { name: 'Delete class' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    return dialog;
  }

  it('navigates to the trial only after the delete succeeds', async () => {
    const { user } = renderPage();

    await pressDelete(user);

    await waitFor(() =>
      expect(deleteMocks.remove).toHaveBeenCalledWith('class', 'class-1', { override: false })
    );
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/trials/trial-1')
    );
  });

  it('does not navigate when the delete fails', async () => {
    deleteMocks.remove.mockRejectedValue(new Error('boom'));
    const { user } = renderPage();

    const dialog = await pressDelete(user);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "We couldn't delete this class. Please try again."
    );
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/shows/show-1/trials/trial-1/classes/class-1'
    );
  });

  it('does not navigate or call the delete while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderPage();

    const dialog = await screen.findByRole('dialog', {
      name: 'Delete the class Interior Novice A?',
    });
    expect(within(dialog).getByRole('button', { name: 'Delete class' })).toBeDisabled();
    expect(deleteMocks.remove).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/shows/show-1/trials/trial-1/classes/class-1'
    );
  });

  it('rejects the panel save when the class update fails, resolves when it succeeds', async () => {
    updateClass.mockRejectedValueOnce(new Error('boom'));
    const { user } = renderPage();

    await user.click(screen.getByRole('button', { name: 'save-class' }));
    await waitFor(() => expect(document.body.dataset.saveResult).toBe('rejected'));

    updateClass.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole('button', { name: 'save-class' }));
    await waitFor(() => expect(document.body.dataset.saveResult).toBe('resolved'));
  });
});
