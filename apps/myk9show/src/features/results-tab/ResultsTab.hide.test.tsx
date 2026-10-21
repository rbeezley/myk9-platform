/**
 * MYK9-1318: a released class is hidden again from its Results detail (the one place a class is
 * released), through `useUnreleaseResults`. Unknown release state offers neither control.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';

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

const CHECKED = { at: '2026-10-10T15:45:00Z', by: 'auth-me' };

/** `undefined` leaves the class with no release row, which reads as unknown. */
function buildRow(releasedAt: string | null | undefined) {
  const releasedAtByClassId = new Map<string, string | null | undefined>();
  if (releasedAt !== undefined) releasedAtByClassId.set('class-1', releasedAt);
  const [row] = buildResultsClassRows({
    trials: [trial],
    trialClasses: {
      'trial-1': [
        {
          id: 'class-1',
          element: 'Containers',
          level: 'Open',
          section: '',
          judgeId: 'j1',
          judgeName: 'Pat Judge',
          startTime: '09:00',
          status: 'Completed',
          entries: 0,
          ...SYNC,
        } as SyncableTrialClass,
      ],
    },
    verifiedByClassId: new Map([['class-1', CHECKED]]),
    releasedAtByClassId: releasedAtByClassId as ReadonlyMap<string, string | null>,
    paperworkByClassId: new Map(),
    entries: [
      {
        id: 'e-1',
        class_id: 'class-1',
        entry_status: 'confirmed',
        check_in_status: 'checked-in',
        is_scored: true,
        result_status: 'qualified',
        armband: '101',
        final_placement: 1,
        search_time_seconds: 61.25,
        total_faults: 0,
        dog: { id: 'd-1', name: 'Ranger', call_name: 'Rex' },
        handler: 'Jane Doe',
        handler_person: null,
        results_line: 'e-1|line',
      } as unknown as SecretaryEntry,
    ],
  });
  return row!;
}

const hook = vi.hoisted(() => ({ rows: [] as ReturnType<typeof buildRow>[] }));
vi.mock('./useResultsTabData', () => ({
  useResultsTabData: () => ({
    rows: hook.rows,
    trials: [trial],
    readState: 'ready',
    refreshFailed: false,
    paperworkAvailable: true,
    retry: vi.fn(),
  }),
}));

const scope = vi.hoisted(() => ({ canOperate: true }));
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: 'resolved', canManage: true, canOperate: scope.canOperate }),
}));

// Visibility timing decides whether hiding changes anything: only `manual_release` fields do.
const timing = vi.hoisted(() => ({
  show: 'manual_release' as string,
  settings: 'ready' as 'ready' | 'loading' | 'error',
  trialOverrides: [] as unknown[],
  classOverrides: [] as unknown[],
}));
const pending = vi.hoisted(() => ({ release: false, verify: false, unrelease: false }));
const net = vi.hoisted(() => ({ online: true }));
vi.mock('@/hooks/useNetworkStatus', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useNetworkStatus')>()),
  useIsOnline: () => net.online,
}));
vi.mock('@/hooks/queries/useShowSettingsDatabase', () => ({
  useShowSettings: () => ({
    data:
      timing.settings === 'ready'
        ? {
            visibility: {
              placement: timing.show,
              qualification: timing.show,
              time: timing.show,
              faults: timing.show,
            },
          }
        : undefined,
    isLoading: timing.settings === 'loading',
    isError: timing.settings === 'error',
  }),
  useTrialOverrides: () => ({ data: timing.trialOverrides }),
  useClassOverrides: () => ({ data: timing.classOverrides }),
}));

const releaseMutate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/mutations/useReleaseResults', () => ({
  useReleaseResults: () => ({ mutate: releaseMutate, isPending: pending.release }),
}));
const unreleaseMutate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/mutations/useUnreleaseResults', () => ({
  useUnreleaseResults: () => ({ mutate: unreleaseMutate, isPending: pending.unrelease }),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), toast) }));

vi.mock('./useClassUnsyncedScores', () => ({
  useClassUnsyncedScores: () => false,
  classHasUnsyncedScores: async () => false,
}));
vi.mock('@/features/show-map/useResultsVerifiedMutations', () => ({
  useResultsVerifiedMutations: () => ({
    verifyAsync: vi.fn(),
    undo: vi.fn(),
    isPending: pending.verify,
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
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'auth-me' } }) }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('./ResultsVisibilitySheet', () => ({ ResultsVisibilitySheet: () => null }));

function mount() {
  return render(
    <Routes>
      <Route path="/shows/:id/results" element={<ResultsTab />} />
    </Routes>,
    { initialRoute: '/shows/show-1/results?status=all&classId=class-1' }
  );
}

const hideButton = () => screen.queryByRole('button', { name: 'Hide results' });
const releaseButton = () => screen.queryByRole('button', { name: 'Release results' });

beforeEach(() => {
  vi.clearAllMocks();
  scope.canOperate = true;
  timing.show = 'manual_release';
  timing.settings = 'ready';
  timing.trialOverrides = [];
  timing.classOverrides = [];
  pending.release = false;
  pending.verify = false;
  pending.unrelease = false;
  net.online = true;
});

describe('Results class detail: Hide results (MYK9-1318)', () => {
  it('a released class shows Hide results and no Release results', () => {
    hook.rows = [buildRow('2026-10-10T16:00:00Z')];
    mount();
    expect(hideButton()).toBeInTheDocument();
    expect(releaseButton()).not.toBeInTheDocument();
  });

  it('Hide results asks first, then un-releases exactly that class', async () => {
    hook.rows = [buildRow('2026-10-10T16:00:00Z')];
    const { user } = mount();

    await user.click(hideButton()!);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Hide results for Containers Open?')).toBeInTheDocument();
    expect(unreleaseMutate).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Hide results' }));

    await waitFor(() => expect(unreleaseMutate).toHaveBeenCalledTimes(1));
    expect(unreleaseMutate).toHaveBeenCalledWith(
      { classIds: ['class-1'], showId: 'show-1' },
      expect.any(Object)
    );
  });

  it('cancelling the confirm does not hide', async () => {
    hook.rows = [buildRow('2026-10-10T16:00:00Z')];
    const { user } = mount();
    await user.click(hideButton()!);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(unreleaseMutate).not.toHaveBeenCalled();
  });

  it('toasts the outcome: success, and an error when the class could not be hidden', async () => {
    hook.rows = [buildRow('2026-10-10T16:00:00Z')];
    unreleaseMutate.mockImplementationOnce((_vars, opts) =>
      opts.onSuccess({ unreleased: ['class-1'], failed: [] })
    );
    const { user } = mount();
    await user.click(hideButton()!);
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Hide results' })
    );
    expect(toast.success).toHaveBeenCalledWith('Results hidden');

    unreleaseMutate.mockImplementationOnce((_vars, opts) =>
      opts.onSuccess({ unreleased: [], failed: ['class-1'] })
    );
    await user.click(hideButton()!);
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Hide results' })
    );
    expect(toast.error).toHaveBeenCalledWith('Could not hide the results. Try again.');
  });

  it('an unreleased class shows Release results and no Hide results', () => {
    hook.rows = [buildRow(null)];
    mount();
    expect(releaseButton()).toBeInTheDocument();
    expect(hideButton()).not.toBeInTheDocument();
  });

  it('an unknown release state offers neither', () => {
    hook.rows = [buildRow(undefined)];
    mount();
    expect(screen.getByRole('heading', { name: 'Release status unknown' })).toBeInTheDocument();
    expect(releaseButton()).not.toBeInTheDocument();
    expect(hideButton()).not.toBeInTheDocument();
  });

  it('a viewer who cannot operate this show is not offered Hide results', () => {
    scope.canOperate = false;
    hook.rows = [buildRow('2026-10-10T16:00:00Z')];
    mount();
    expect(hideButton()).not.toBeInTheDocument();
  });

  const RELEASED = '2026-10-10T16:00:00Z';
  const AFTER_REVIEW_LINE =
    'This class shows results as they are scored. Set it to After Review in Visibility settings to hide them.';

  it('a released class under manual release, online and idle has Hide enabled and no reason line', () => {
    hook.rows = [buildRow(RELEASED)];
    mount();
    expect(hideButton()).toBeEnabled();
    expect(screen.queryByText(/Wait for the current action/)).not.toBeInTheDocument();
    expect(screen.queryByText(AFTER_REVIEW_LINE)).not.toBeInTheDocument();
  });

  it('a released class on Immediately timing keeps Hide, disabled, with the After Review line', () => {
    timing.show = 'immediate';
    hook.rows = [buildRow(RELEASED)];
    mount();
    expect(hideButton()).toBeDisabled();
    expect(screen.getByText(AFTER_REVIEW_LINE)).toBeInTheDocument();
  });

  it('offline: Hide is disabled with the connection line, even under manual release', () => {
    net.online = false;
    hook.rows = [buildRow(RELEASED)];
    mount();
    expect(hideButton()).toBeDisabled();
    expect(screen.getByText('Needs a connection to hide results.')).toBeInTheDocument();
  });

  it('while the visibility settings load: disabled with the checking line', () => {
    timing.settings = 'loading';
    hook.rows = [buildRow(RELEASED)];
    mount();
    expect(hideButton()).toBeDisabled();
    expect(screen.getByText("Checking this class's visibility settings.")).toBeInTheDocument();
  });

  it('settings failed with no data: disabled with the could-not-read line', () => {
    timing.settings = 'error';
    hook.rows = [buildRow(RELEASED)];
    mount();
    expect(hideButton()).toBeDisabled();
    expect(
      screen.getByText("Could not read this class's visibility settings.")
    ).toBeInTheDocument();
  });

  it.each([
    ['releasing', 'release'],
    ['verifying', 'verify'],
  ] as const)('while %s, Hide is disabled', (_label, key) => {
    pending[key] = true;
    hook.rows = [buildRow(RELEASED)];
    mount();
    expect(hideButton()).toBeDisabled();
  });

  it('while hiding, Release results is disabled on a ready-to-release row', () => {
    pending.unrelease = true;
    hook.rows = [buildRow(null)];
    mount();
    expect(releaseButton()).toBeDisabled();
  });

  it('reads the class override by the class id and the trial override by the trial id', () => {
    timing.show = 'immediate';
    hook.rows = [buildRow(RELEASED)];
    // Entries keyed by swapped ids (the class id in the trial slot and the reverse) must not match.
    timing.classOverrides = [
      { classId: 'trial-1', trialId: 'class-1', override: { placement: 'manual_release' } },
    ];
    timing.trialOverrides = [{ trialId: 'class-1', override: { placement: 'manual_release' } }];
    const swapped = mount();
    expect(hideButton()).toBeDisabled();
    swapped.unmount();

    timing.classOverrides = [
      { classId: 'class-1', trialId: 'trial-1', override: { placement: 'manual_release' } },
    ];
    timing.trialOverrides = [];
    const byClass = mount();
    expect(hideButton()).toBeEnabled();
    byClass.unmount();

    timing.classOverrides = [];
    timing.trialOverrides = [{ trialId: 'trial-1', override: { placement: 'manual_release' } }];
    mount();
    expect(hideButton()).toBeEnabled();
  });

  it('toasts the failure when the un-release rejects', async () => {
    hook.rows = [buildRow(RELEASED)];
    unreleaseMutate.mockImplementationOnce((_vars, opts) => opts.onError(new Error('x')));
    const { user } = mount();
    await user.click(hideButton()!);
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Hide results' })
    );
    expect(toast.error).toHaveBeenCalledWith('Could not hide the results. Try again.');
  });
});
