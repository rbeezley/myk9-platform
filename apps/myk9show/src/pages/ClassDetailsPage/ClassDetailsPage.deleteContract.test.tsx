import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import type { ClassData } from '@/components/classes/types/classTypes';

// MYK9-900: Class Details hands DeleteClassDialog / ClassEditPanel a promise that REJECTS on
// failure. A failed delete must not navigate away from a class that still exists, and a failed
// save must reject into the panel (which keeps the user's edits open).

const mockUseClassDetailsData = vi.hoisted(() => vi.fn());
const deleteClass = vi.hoisted(() => vi.fn());
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
vi.mock('@/components/entries/RemoveEntryDialog', () => ({ RemoveEntryDialog: () => null }));
vi.mock('@/components/classes/ClassRequirementsPanel', () => ({
  ClassRequirementsPanel: () => null,
}));
// The dialogs expose the page's callbacks the way the real components call them.
vi.mock('./DeleteClassDialog', () => ({
  DeleteClassDialog: ({ onConfirm }: { onConfirm: () => Promise<void> }) => (
    <button type="button" onClick={() => onConfirm().catch(() => undefined)}>
      confirm-delete
    </button>
  ),
}));
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
    deleteClass.mockReset();
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
      deleteClass,
    });
  });

  it('navigates to the trial only after the delete succeeds', async () => {
    deleteClass.mockResolvedValue(undefined);
    const { user } = renderPage();

    await user.click(screen.getByRole('button', { name: 'confirm-delete' }));

    expect(deleteClass).toHaveBeenCalledWith('class-1');
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/trials/trial-1')
    );
  });

  it('does not navigate when the delete fails', async () => {
    deleteClass.mockRejectedValue(new Error('boom'));
    const { user } = renderPage();

    await user.click(screen.getByRole('button', { name: 'confirm-delete' }));

    await waitFor(() => expect(deleteClass).toHaveBeenCalled());
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/shows/show-1/trials/trial-1/classes/class-1'
    );
  });

  it('does not navigate or call the delete while offline', async () => {
    mockConnectionHint = 'Needs a connection';
    const { user } = renderPage();

    await user.click(screen.getByRole('button', { name: 'confirm-delete' }));

    expect(deleteClass).not.toHaveBeenCalled();
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
