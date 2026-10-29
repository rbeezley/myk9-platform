/**
 * MYK9-1473: a recorded coin flip can be corrected until the results are released, and the dialog
 * never opens empty when the show details are not read yet.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { replicatedClassesTable } from '@/services/replication';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import type { SecretaryEntry } from '@/services/database/entries';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import { buildResultsClassRows } from './buildResultsClassRows';
import ResultsTab from './ResultsTab';

const SYNC = {
  _version: 1,
  _lastModified: new Date(0),
  _lastModifiedBy: '',
  _syncStatus: 'synced',
} as const;

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Fall Trial',
  trialDate: '2026-10-10',
  trialNumber: '1',
  status: 'Scheduled',
  ...SYNC,
} as SyncableTrial;

const cls = {
  id: 'class-1',
  element: 'Containers',
  level: 'Novice',
  section: '',
  judgeId: 'j1',
  judgeName: 'Pat Judge',
  startTime: '08:00',
  status: 'Completed',
  entries: 0,
  ...SYNC,
} as SyncableTrialClass;

const entry = (id: string, armband: string, fields: Record<string, unknown>) =>
  ({
    id,
    class_id: 'class-1',
    entry_status: 'confirmed',
    check_in_status: 'checked-in',
    is_scored: true,
    result_status: 'qualified',
    armband,
    search_time_seconds: 41,
    total_faults: 0,
    dog: { id: `d-${id}`, name: id, call_name: id },
    handler: 'Jane Doe',
    handler_person: null,
    results_line: `${id}|line`,
    ...fields,
  }) as unknown as SecretaryEntry;

const RECORDED = [
  entry('Bella', '31', { final_placement: 1, placement_tiebreak: 1 }),
  entry('Rex', '12', { final_placement: 2, placement_tiebreak: 2 }),
];
const UNRESOLVED = [
  entry('Bella', '31', { final_placement: 1, placement_tie: 'unresolved' }),
  entry('Rex', '12', { final_placement: 2, placement_tie: 'unresolved' }),
];

function rowsFor(entries: SecretaryEntry[], opts: { released: boolean; checked: boolean }) {
  return buildResultsClassRows({
    trials: [trial],
    trialClasses: { 'trial-1': [cls] },
    verifiedByClassId: new Map([
      [
        'class-1',
        opts.checked ? { at: '2026-10-10T15:45:00Z', by: 'auth-me' } : { at: null, by: null },
      ],
    ]),
    releasedAtByClassId: new Map([['class-1', opts.released ? '2026-10-10T16:00:00Z' : null]]),
    paperworkByClassId: new Map(),
    entries,
  });
}

const hook = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  retry: vi.fn(),
}));
vi.mock('./useResultsTabData', () => ({ useResultsTabData: () => hook.value }));

const save = vi.hoisted(() => vi.fn());
vi.mock('./useRecordCoinFlip', () => ({
  useRecordCoinFlip: () => ({ save, isPending: false }),
}));
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: 'resolved', canManage: true, canOperate: true }),
}));
vi.mock('@/hooks/mutations/useReleaseResults', () => ({
  useReleaseResults: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/mutations/useUnreleaseResults', () => ({
  useUnreleaseResults: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('./useClassUnsyncedScores', () => ({
  useClassUnsyncedScores: () => false,
  classHasUnsyncedScores: async () => false,
}));
vi.mock('@/features/show-map/useResultsVerifiedMutations', () => ({
  useResultsVerifiedMutations: () => ({
    verifyAsync: vi.fn(),
    undo: vi.fn(),
    isPending: false,
    refreshClass: vi.fn(),
  }),
}));
vi.mock('@/features/show-map/useJudgeSignOffMutations', () => ({
  useJudgeSignOffMutations: () => ({
    recordSignOff: vi.fn(),
    clearSignOff: vi.fn(),
    isPending: false,
  }),
}));
vi.mock('@/hooks/useNetworkStatus', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useNetworkStatus')>()),
  useIsOnline: () => true,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'auth-me' } }) }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('./ResultsVisibilitySheet', () => ({ ResultsVisibilitySheet: () => null }));

function setHook(
  entries: SecretaryEntry[],
  opts: { released?: boolean; checked?: boolean; rankingKeyState?: string } = {}
) {
  hook.value = {
    rows: rowsFor(entries, { released: opts.released ?? false, checked: opts.checked ?? true }),
    trials: [trial],
    readState: 'ready',
    isNationals: opts.rankingKeyState && opts.rankingKeyState !== 'ready' ? null : false,
    rankingKeyState: opts.rankingKeyState ?? 'ready',
    refreshFailed: false,
    paperworkAvailable: true,
    retry: hook.retry,
  };
}

function renderTab() {
  return render(
    <Routes>
      <Route path="/shows/:id/results" element={<ResultsTab />} />
    </Routes>,
    { initialRoute: '/shows/show-1/results?status=all&classId=class-1' }
  );
}

beforeEach(() => {
  vi.spyOn(replicatedClassesTable, 'getReplicatedRow').mockResolvedValue(null);
  vi.spyOn(replicatedClassesTable, 'hasUnsyncedLocalWork').mockResolvedValue(false);
  save.mockReset();
  save.mockResolvedValue(undefined);
  hook.retry.mockReset();
});

describe('ResultsTab coin flip correction', () => {
  it('offers Change coin-flip order on a checked, unreleased class and reopens the recorded order', async () => {
    setHook(RECORDED);
    const { user } = renderTab();

    await user.click(await screen.findByRole('button', { name: 'Change coin-flip order' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Change the coin flip')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Armband 31 Bella/ })).toHaveTextContent(
      '1st'
    );

    await user.click(within(dialog).getByRole('button', { name: /Armband 12 Rex/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save coin flip' }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        classId: 'class-1',
        trialId: 'trial-1',
        orders: [['Rex', 'Bella']],
      })
    );
  });

  it('also offers it before the check is saved', async () => {
    setHook(RECORDED, { checked: false });
    renderTab();
    expect(
      await screen.findByRole('button', { name: 'Change coin-flip order' })
    ).toBeInTheDocument();
  });

  it('hides it once the results are released', async () => {
    setHook(RECORDED, { released: true });
    renderTab();
    await screen.findByRole('region', { name: /results/i });
    expect(screen.queryByRole('button', { name: 'Change coin-flip order' })).toBeNull();
  });

  it('shows the retry, not an empty dialog, when the show details cannot be read', async () => {
    setHook(UNRESOLVED, { checked: false, rankingKeyState: 'unavailable' });
    const { user } = renderTab();

    await user.click(await screen.findByRole('button', { name: 'Record coin flip' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Save coin flip' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(hook.retry).toHaveBeenCalledTimes(1);
  });
});
