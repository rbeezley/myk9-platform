import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { SetupClassDialogs } from '../SetupClassDialogs';
import ClassDetailsPage from '@/pages/ClassDetailsPage/index';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  update: vi.fn(),
  sync: vi.fn(),
  close: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
const currentClass = {
  id: 'c1',
  trialId: 't1',
  element: 'Interior',
  level: 'Novice',
  section: 'A',
  judgeId: 'j1',
  judgeName: 'First Judge',
  status: 'Upcoming',
  entries: 0,
};
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment: mocks.prepare }));
vi.mock('@/services/replication', async original => ({
  ...(await original<typeof import('@/services/replication')>()),
  replicatedClassesTable: { sync: mocks.sync },
}));
vi.mock('@/store/trialStore', () => ({
  useTrialStore: { getState: () => ({ loadTrialClasses: async () => undefined }) },
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ updateClass: mocks.update }),
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    shows: [
      {
        id: 's1',
        assignedJudges: [
          { judgeId: 'j1', judgeName: 'First Judge' },
          { judgeId: 'j2', judgeName: 'Second Judge' },
        ],
      },
    ],
  }),
}));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: mocks.success, error: mocks.error },
}));
vi.mock('@/pages/ClassDetailsPage/useClassDetailsData', () => ({
  useClassDetailsData: () => ({
    classId: 'c1',
    showId: 's1',
    trialId: 't1',
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
      canOperate: false,
      hasOperationalStaffRole: false,
      clubId: 'club1',
    },
    parentTrial: { id: 't1', showId: 's1', trialNumber: '1' },
    parentShow: { id: 's1', name: 'Show', clubId: 'club1', organization: 'AKC' },
    dogs: [],
    updateClass: mocks.update,
  }),
}));
vi.mock('@/pages/ClassDetailsPage/useClassDetailsDialogs', () => ({
  useClassDetailsDialogs: () => ({
    editClassPanelOpen: true,
    closeEditClassPanel: mocks.close,
    openEditClassPanel: vi.fn(),
    deleteEntryDialogOpen: false,
  }),
}));
vi.mock('@/pages/ClassDetailsPage/useMyEntriesInClass', () => ({
  useMyEntriesInClass: () => ({ myEntries: [], isAfterClass: false }),
}));
vi.mock('@/components/classes/ClassDetailsMain', () => ({ default: () => null }));
vi.mock('@/components/classes/ClassCompactHeader', () => ({ ClassCompactHeader: () => null }));
vi.mock('@/components/common/PageShell', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe.each(['Setup', 'Class Details'])(
  '%s required judge save through the real panel',
  surface => {
    beforeEach(() => {
      vi.clearAllMocks();
      mocks.prepare
        .mockReset()
        .mockRejectedValueOnce(new Error('Unable to prepare judge assignment'))
        .mockResolvedValue(undefined);
      mocks.update.mockReset().mockResolvedValue(undefined);
      mocks.sync.mockReset().mockResolvedValue(undefined);
    });
    it('retains the selected judge without Saved or closing, then saves a retry', async () => {
      const { user } = render(
        surface === 'Setup' ? (
          <SetupClassDialogs
            showId="s1"
            pending={{
              action: 'edit',
              trialId: 't1',
              requestId: 1,
              classSnapshot: currentClass as never,
            }}
            onClose={mocks.close}
          />
        ) : (
          <ClassDetailsPage />
        )
      );
      await user.click(screen.getByLabelText('Judge'));
      await user.click(await screen.findByRole('option', { name: 'Second Judge' }));
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));
      await waitFor(() => expect(mocks.error).toHaveBeenCalled());
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.success).not.toHaveBeenCalled();
      expect(mocks.close).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Judge')).toHaveTextContent('Second Judge');
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));
      await waitFor(() => expect(mocks.close).toHaveBeenCalledTimes(1));
      expect(mocks.prepare).toHaveBeenCalledWith('s1', 'c1', 'j2');
      expect(mocks.update).toHaveBeenCalledWith('c1', expect.objectContaining({ judgeId: 'j2' }));
      expect(mocks.success).toHaveBeenCalledWith('Interior saved');
    });
  }
);
