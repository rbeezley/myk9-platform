/**
 * MYK9-1516: the nationals leaderboard is a view of the Results tab, offered only for a nationals
 * show and fed only by released classes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { render, screen, within } from '@/test/utils/testUtils';
import type { SecretaryEntry } from '@/services/database/entries';
import type { SyncableTrial } from '@/store/trial-store-types';
import ResultsTab from './ResultsTab';

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  trialDate: '2026-10-10',
  trialNumber: '1',
} as SyncableTrial;

const entry = (armband: string, classId: string, points: number, seconds: number) =>
  ({
    id: `e-${armband}-${classId}`,
    class_id: classId,
    armband,
    entry_status: 'confirmed',
    is_scored: true,
    result_status: 'qualified',
    points_earned: points,
    search_time_seconds: seconds,
    dog: { id: `d-${armband}`, name: `Dog ${armband}`, call_name: null },
    handler_identity: { source: 'entered', name: `Handler ${armband}` },
  }) as unknown as SecretaryEntry;

const hook = vi.hoisted(() => ({
  isNationals: true as boolean | null,
  refreshFailed: false,
  entries: [] as unknown[],
  rows: [] as unknown[],
}));
vi.mock('./useResultsTabData', () => ({
  useResultsTabData: () => ({
    rows: hook.rows,
    entries: hook.entries,
    showStartDate: '2026-10-10',
    trials: [trial],
    readState: 'ready',
    isNationals: hook.isNationals,
    rankingKeyState: 'ready' as const,
    refreshFailed: hook.refreshFailed,
    paperworkAvailable: true,
    retry: vi.fn(),
  }),
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
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
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
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'auth-me' } }) }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('./ResultsVisibilitySheet', () => ({ ResultsVisibilitySheet: () => null }));

function mount(search: string) {
  return render(
    <Routes>
      <Route path="/shows/:id/results" element={<ResultsTab />} />
    </Routes>,
    { initialRoute: `/shows/show-1/results${search}` }
  );
}

const LINK = { name: 'Nationals leaderboard' };

beforeEach(() => {
  hook.isNationals = true;
  hook.refreshFailed = false;
  hook.rows = [
    { id: 'c1', trialId: 'trial-1', trialDate: '2026-10-10', releasedAt: '2026-10-10T16:00:00Z' },
    { id: 'c-hidden', trialId: 'trial-1', trialDate: '2026-10-10', releasedAt: null },
  ].map(row => ({
    ...row,
    name: 'Containers Open',
    trialLabel: 'Trial 1',
    judgeName: 'Pat Judge',
    entries: [],
    phase: 'released',
    phaseLabel: 'Released',
    nextAction: { kind: 'none', label: 'Done' },
    paperwork: [],
  }));
  hook.entries = [
    entry('7', 'c1', 20, 90),
    entry('8', 'c1', 20, 80),
    entry('9', 'c-hidden', 99, 1),
  ];
});

describe('Results tab: Nationals leaderboard (MYK9-1516)', () => {
  it('offers the leaderboard only on a nationals show', () => {
    hook.isNationals = false;
    mount('');
    expect(screen.queryByRole('link', LINK)).not.toBeInTheDocument();
  });

  it('does not open from the URL on a show that is not nationals', () => {
    hook.isNationals = false;
    mount('?view=leaderboard');
    expect(
      screen.queryByRole('heading', { name: 'Nationals Leaderboard' })
    ).not.toBeInTheDocument();
  });

  it('links to the board from the class list', () => {
    mount('');
    expect(screen.getByRole('link', LINK)).toHaveAttribute(
      'href',
      '/shows/show-1/results?view=leaderboard'
    );
  });

  it('shows the columns, ranks released scores only, and links back', () => {
    mount('?view=leaderboard');
    const headers = screen.getAllByRole('columnheader').map(header => header.textContent);
    expect(headers).toEqual([
      'Rank',
      'Armband',
      'Dog',
      'Handler',
      'Total Pts',
      'Total Time',
      'Day 1',
      'Day 2',
      'Day 3',
      'Status',
    ]);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(
      within(rows[0]!)
        .getAllByRole('cell')
        .map(cell => cell.textContent)
    ).toEqual(['1', '8', 'Dog 8', 'Handler 8', '20', '01:20', '20', '–', '–', '–']);
    expect(within(rows[1]!).getAllByRole('cell')[1]).toHaveTextContent('7');
    expect(screen.getByRole('link', { name: /Back to classes/ })).toHaveAttribute(
      'href',
      '/shows/show-1/results'
    );
  });

  it('keeps the stale-data warning and Retry on the board', () => {
    hook.refreshFailed = true;
    mount('?view=leaderboard');
    expect(screen.getByText("Couldn't refresh the scores")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('says so when nothing is released and scored', () => {
    hook.entries = [entry('9', 'c-hidden', 99, 1)];
    mount('?view=leaderboard');
    expect(screen.getByText('No rankings yet.')).toBeInTheDocument();
    expect(screen.getByText('Rankings appear here once entries are scored.')).toBeInTheDocument();
  });
});
