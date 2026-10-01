import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { ClassData } from '@/components/classes/types/classTypes';

// MYK9-901: the class detail page reaches the SAME remove-entry dialog the
// Entries tab uses. This renders the page on the raw entry shape the data hook
// returns (not a hand-built dialog prop) and walks row -> dialog -> write, so a
// field dropped by the page's projection (last-hop-drop) fails here.

const mockUseClassDetailsData = vi.hoisted(() => vi.fn());
const mockDeleteEntry = vi.hoisted(() => vi.fn());

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
vi.mock('@/store/entryStore', () => ({
  useEntryStore: { getState: () => ({ deleteEntry: mockDeleteEntry }) },
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

function mockData(competitionData: Record<string, unknown>) {
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
    deleteClass: vi.fn(),
  });
}

describe('ClassDetailsPage remove-entry dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteEntry.mockResolvedValue(undefined);
  });

  it('shows the shared dialog with the row’s dog, handler and armband', async () => {
    mockData({});
    const { user } = render(<ClassDetailsPage />, {
      initialRoute: '/shows/show-1/trials/trial-1/classes/class-1',
    });

    await user.click(screen.getByRole('button', { name: /row trash/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Remove entry?');
    expect(dialog).toHaveTextContent(/removes Rex from/i);
    expect(dialog).toHaveTextContent('Handler: Jane Handler');
    expect(dialog).toHaveTextContent('Armband: #42');
    expect(dialog).not.toHaveTextContent(/recorded results/i);
  });

  it('warns when the row already has results, and removes only on confirm', async () => {
    mockData({ score: '95' });
    const { user } = render(<ClassDetailsPage />, {
      initialRoute: '/shows/show-1/trials/trial-1/classes/class-1',
    });

    await user.click(screen.getByRole('button', { name: /row trash/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/recorded results/i);
    expect(mockDeleteEntry).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^remove entry$/i }));
    expect(mockDeleteEntry).toHaveBeenCalledWith('entry-1');
  });
});
