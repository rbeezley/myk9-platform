import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';

import { replicatedClassesTable } from '@/services/replication';
import { render, screen } from '@/test/utils/testUtils';
import type { SecretaryEntry } from '@/services/database/entries';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import { buildResultsClassRows } from './buildResultsClassRows';
import ResultsTab from './ResultsTab';
import type { ResultsTabReadState } from './useResultsTabData';

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

const level = (id: string, name: string, startTime: string): SyncableTrialClass =>
  ({
    id,
    element: 'Containers',
    level: name,
    section: '',
    judgeId: 'j1',
    judgeName: 'Pat Judge',
    startTime,
    status: 'Completed',
    entries: 0,
    ...SYNC,
  }) as SyncableTrialClass;

const entry = (id: string, classId: string, fields: Record<string, unknown> = {}) =>
  ({
    id,
    class_id: classId,
    entry_status: 'confirmed',
    check_in_status: 'checked-in',
    is_scored: true,
    result_status: 'qualified',
    armband: '101',
    final_placement: 1,
    search_time_seconds: 61.25,
    total_faults: 0,
    dog: { id: `d-${id}`, name: 'Ranger', call_name: 'Rex' },
    handler: 'Jane Doe',
    handler_person: null,
    results_line: `${id}|line`,
    ...fields,
  }) as unknown as SecretaryEntry;

const hookRows = () =>
  buildResultsClassRows({
    trials: [trial],
    trialClasses: {
      'trial-1': [level('class-novice', 'Novice', '08:00'), level('class-open', 'Open', '09:00')],
    },
    verifiedByClassId: new Map(),
    releasedAtByClassId: new Map<string, string | null>(),
    paperworkByClassId: new Map(),
    entries: [entry('e-novice', 'class-novice'), entry('e-open', 'class-open')],
  });

const hook = vi.hoisted(() => ({
  value: {
    rows: [] as ReturnType<typeof hookRows>,
    entries: [],
    trials: [] as SyncableTrial[],
    readState: 'ready' as ResultsTabReadState,
    isNationals: false,
    rankingKeyState: 'ready' as const,
    refreshFailed: false,
    paperworkAvailable: true,
    retry: vi.fn(),
  },
}));
vi.mock('./useResultsTabData', () => ({ useResultsTabData: () => hook.value }));

const scope = vi.hoisted(() => ({ canOperate: true }));
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: 'resolved', canManage: true, canOperate: scope.canOperate }),
}));

const releaseMutate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/mutations/useReleaseResults', () => ({
  useReleaseResults: () => ({ mutate: releaseMutate, isPending: false }),
}));

const serverCheck = vi.hoisted(() => ({
  read: vi.fn(async (_id: string) => '2026-10-10T15:45:00Z'),
}));
vi.mock('@/features/show-map/resultsVerifiedMutations', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/show-map/resultsVerifiedMutations')>()),
  readServerResultsVerifiedAt: serverCheck.read,
}));
const unsynced = vi.hoisted(() => ({ value: false as boolean | null }));
const unsyncedNow = vi.hoisted(() => ({ check: vi.fn(async (_id: string) => false) }));
vi.mock('./useClassUnsyncedScores', () => ({
  useClassUnsyncedScores: () => unsynced.value,
  classHasUnsyncedScores: unsyncedNow.check,
}));
const refreshClass = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: toastError }),
}));
const verifyMutate = vi.hoisted(() => vi.fn(async (_input: unknown) => undefined));
const undoMutate = vi.hoisted(() => vi.fn());
vi.mock('@/features/show-map/useResultsVerifiedMutations', () => ({
  useResultsVerifiedMutations: () => ({
    verifyAsync: verifyMutate,
    undo: undoMutate,
    isPending: false,
    refreshClass,
  }),
}));
const net = vi.hoisted(() => ({ online: true }));
vi.mock('@/hooks/useNetworkStatus', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useNetworkStatus')>()),
  useIsOnline: () => net.online,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'auth-me' } }) }));
const recordSignOff = vi.hoisted(() => vi.fn());
const clearSignOff = vi.hoisted(() => vi.fn());
vi.mock('@/features/show-map/useJudgeSignOffMutations', () => ({
  useJudgeSignOffMutations: () => ({ recordSignOff, clearSignOff, isPending: false }),
}));

const media = vi.hoisted(() => ({ wide: false }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => media.wide }));

vi.mock('./ResultsVisibilitySheet', () => ({
  ResultsVisibilitySheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="visibility-sheet" /> : null,
}));

function LocationProbe() {
  return <output data-testid="location-search">{useLocation().search}</output>;
}

function renderAt(search = '') {
  return render(
    <Routes>
      <Route
        path="/shows/:id/results"
        element={
          <>
            <ResultsTab />
            <LocationProbe />
          </>
        }
      />
    </Routes>,
    { initialRoute: `/shows/show-1/results${search}` }
  );
}

beforeEach(() => {
  vi.spyOn(replicatedClassesTable, 'getReplicatedRow').mockResolvedValue(null);
  vi.spyOn(replicatedClassesTable, 'hasUnsyncedLocalWork').mockResolvedValue(false);
  media.wide = false;
  hook.value = {
    rows: hookRows(),
    entries: [],
    trials: [trial],
    readState: 'ready',
    isNationals: false,
    rankingKeyState: 'ready' as const,
    refreshFailed: false,
    paperworkAvailable: true,
    retry: vi.fn(),
  };
});

describe('ResultsTab carried class (MYK9-1996)', () => {
  it('opens a carried class the show has, with no notice', () => {
    renderAt('?status=all&classId=class-open');

    expect(screen.getByRole('heading', { name: /Containers Open/ })).toBeInTheDocument();
    expect(screen.queryByTestId('carried-class-notice')).not.toBeInTheDocument();
  });

  it('says so for a carried class it cannot show and opens no other class', () => {
    renderAt('?status=all&classId=class-gone');

    expect(screen.getByTestId('carried-class-notice')).toHaveTextContent(
      "That class isn't shown here. Pick a class."
    );
    expect(screen.getByRole('list', { name: 'Classes' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Containers (Novice|Open)/ })).toBeNull();
  });

  it('opens on no class and no notice when none is carried', () => {
    renderAt('?status=all');

    expect(screen.queryByTestId('carried-class-notice')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Classes' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Containers (Novice|Open)/ })).toBeNull();
  });
});
