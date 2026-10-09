import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import type { ClassData } from '@/components/classes/types/classTypes';

// MYK9-901 / CRUD standard Phase 2: the class detail page reaches the SAME shared delete
// dialog the Entries tab uses. This renders the page on the raw entry shape the data hook
// returns (not a hand-built dialog prop) and walks row -> dialog -> write, so a field dropped
// by the page's projection (last-hop-drop) fails here. The write is the soft_delete_entry RPC,
// never the replication queue's hard DELETE the page used before.

const mockUseClassDetailsData = vi.hoisted(() => vi.fn());
const deleteMocks = vi.hoisted(() => ({ preview: vi.fn(), remove: vi.fn(), purge: vi.fn() }));
vi.mock('@/features/delete/deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deletePreview')>()),
  fetchDeletePreview: deleteMocks.preview,
}));
vi.mock('@/features/delete/deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: vi.fn().mockResolvedValue({ total: 0, failed: 0 }),
}));
vi.mock('@/features/delete/deleteServer', () => ({
  softDeleteOnServer: deleteMocks.remove,
  restoreOnServer: vi.fn(),
}));
vi.mock('@/features/delete/deleteLocalState', () => ({
  reconcileLocalDeletion: deleteMocks.purge,
}));
const counts = (paid: number, scored: number) => ({
  trials: 0,
  classes: 0,
  entries: 0,
  shows: 0,
  dogs: 0,
  paid,
  scored,
  blocking: paid + scored > 0 ? 1 : 0,
});

vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));
vi.mock('./useClassDetailsData', () => ({
  useClassDetailsData: mockUseClassDetailsData,
}));
vi.mock('./useMyEntriesInClass', () => ({
  useMyEntriesInClass: () => ({ myEntries: [], isAfterClass: false }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'u1' },
    hasRole: () => false,
    userWithRoles: { id: 'u1', scopes: [] },
  }),
}));
vi.mock('@/components/common/PageShell', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/common/PageHeader', () => ({ PageHeader: () => null }));
vi.mock('@/components/classes/ClassCompactHeader', () => ({ ClassCompactHeader: () => null }));
vi.mock('@/components/classes/ClassRequirementsPanel', () => ({
  ClassRequirementsPanel: () => null,
}));
vi.mock('@/components/classes/ClassDetailsMain', () => ({
  default: ({ onDeleteEntry }: { onDeleteEntry: (id: string) => void }) => (
    <button type="button" onClick={() => onDeleteEntry('entry-1')}>
      row trash
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

function mockData(
  competitionData: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
) {
  mockUseClassDetailsData.mockReturnValue({
    classId: 'class-1',
    trialId: 'trial-1',
    isResultsView: false,
    classes: [currentClass],
    currentClass,
    trialClasses: [currentClass],
    localRawEntries: [
      {
        id: 'entry-1',
        dogId: 'dog-1',
        registrationData: { handler: 'Jane Handler', armband: '42' },
        competitionData,
      },
    ],
    dbRawEntries: [],
    classEntries: [],
    entriesLoading: false,
    entriesError: null,
    manageScope: {
      status: 'resolved',
      canManage: false,
      canOperate: false,
      hasOperationalStaffRole: false,
    },
    parentTrial: { id: 'trial-1', showId: 'show-1', trialNumber: '1' },
    parentShow: { id: 'show-1', name: 'Spring Classic', organization: 'AKC', clubId: 'club-1' },
    dogs: [{ id: 'dog-1', name: 'Rex Registered', callName: 'Rex' }],
    updateClass: vi.fn(),
    ...overrides,
  });
}

describe('ClassDetailsPage remove-entry dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteMocks.preview.mockResolvedValue(counts(0, 0));
    deleteMocks.remove.mockResolvedValue(undefined);
    deleteMocks.purge.mockResolvedValue(undefined);
  });

  it('shows the shared dialog with the row’s dog, handler and class', async () => {
    mockData({});
    const { user } = render(<ClassDetailsPage />, {
      initialRoute: '/shows/show-1/trials/trial-1/classes/class-1',
    });

    await user.click(screen.getByRole('button', { name: /row trash/i }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete the entry for Rex?' });
    expect(
      within(dialog).getByText('Rex · handled by Jane Handler · Interior Novice A')
    ).toBeVisible();
    expect(deleteMocks.preview).toHaveBeenCalledWith('entry', 'entry-1');
  });

  it('a scored entry is blocked with a Withdraw / Pull pointer, and nothing is deleted', async () => {
    mockData({ score: '95' });
    deleteMocks.preview.mockResolvedValue(counts(0, 1));
    const { user } = render(<ClassDetailsPage />, {
      initialRoute: '/shows/show-1/trials/trial-1/classes/class-1',
    });

    await user.click(screen.getByRole('button', { name: /row trash/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(
      await within(dialog).findByText(
        'This entry is scored. Use Withdraw or Pull instead of deleting it.'
      )
    ).toBeVisible();
    expect(within(dialog).getByRole('link', { name: 'Withdraw / Pull entries' })).toHaveAttribute(
      'href',
      '/shows/show-1/entries?queue=all&entry=entry-1'
    );
    expect(within(dialog).getByRole('button', { name: 'Delete entry' })).toBeDisabled();
    expect(deleteMocks.remove).not.toHaveBeenCalled();
  });

  it('removes only on confirm, through the soft-delete RPC', async () => {
    mockData({});
    const { user } = render(<ClassDetailsPage />, {
      initialRoute: '/shows/show-1/trials/trial-1/classes/class-1',
    });

    await user.click(screen.getByRole('button', { name: /row trash/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(deleteMocks.remove).not.toHaveBeenCalled();
    const confirm = within(dialog).getByRole('button', { name: 'Delete entry' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() =>
      expect(deleteMocks.remove).toHaveBeenCalledWith('entry', 'entry-1', { override: false })
    );
  });

  it('opens for an entry only the query supplied (not in the local entry store)', async () => {
    mockData(
      {},
      {
        localRawEntries: [],
        dbRawEntries: [
          {
            id: 'entry-1',
            dog_id: 'dog-1',
            handler: 'Query Handler',
            dog: { id: 'dog-1', name: 'Rex Registered', call_name: 'Rex' },
          },
        ],
        classEntries: [
          {
            id: 'entry-1',
            armband: '7',
            handler: 'Query Handler',
            dog: 'Rex',
            status: '',
            score: '',
            time: '',
            placement: '',
            classId: 'class-1',
          },
        ],
      }
    );
    const { user } = render(<ClassDetailsPage />, {
      initialRoute: '/shows/show-1/trials/trial-1/classes/class-1',
    });

    await user.click(screen.getByRole('button', { name: /row trash/i }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete the entry for Rex?' });
    expect(
      within(dialog).getByText('Rex · handled by Query Handler · Interior Novice A')
    ).toBeVisible();
  });
});
