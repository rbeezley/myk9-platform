/**
 * MYK9-1031: Release asks the server whether the class is checked. If the check is taken back
 * (Undo) while that read is in flight, the answer is stale and the release must not be queued.
 * The detail disables Undo while a release is pending, so this path is driven through the props
 * the detail would call.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { act } from '@testing-library/react';

import { render } from '@/test/utils/testUtils';
import type { ResultsClassRow } from './buildResultsClassRows';
import ResultsTab from './ResultsTab';

const captured = vi.hoisted(() => ({
  props: null as null | { onRelease: () => void; onUndoVerify: () => void },
}));
const row = vi.hoisted(
  () =>
    ({
      id: 'c1',
      trialId: 't1',
      name: 'Containers Novice',
      phase: 'ready-to-release',
      entries: [],
      runFinished: true,
      judgeDayKey: 'k',
      judgeSignedOffAt: null,
      releasedAt: null,
      takesJudgeSignOff: false,
      trialLabel: 'Trial 1',
      judgeName: '',
    }) as unknown as ResultsClassRow
);

vi.mock('./useResultsTabData', () => ({
  useResultsTabData: () => ({
    rows: [row],
    trials: [],
    readState: 'ready',
    refreshFailed: false,
    paperworkAvailable: true,
    retry: vi.fn(),
  }),
}));
vi.mock('./ResultsClassDetail', () => ({
  ResultsClassDetail: (props: { onRelease: () => void; onUndoVerify: () => void }) => {
    captured.props = props;
    return null;
  },
}));
vi.mock('./ResultsTabToolbar', () => ({ ResultsTabToolbar: () => null }));
vi.mock('./ResultsVisibilitySheet', () => ({ ResultsVisibilitySheet: () => null }));
const releaseMutate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/mutations/useReleaseResults', () => ({
  useReleaseResults: () => ({ mutate: releaseMutate, isPending: false }),
}));
const undo = vi.hoisted(() => vi.fn());
vi.mock('@/features/show-map/useResultsVerifiedMutations', () => ({
  useResultsVerifiedMutations: () => ({
    verifyAsync: vi.fn(),
    undo,
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
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u' } }) }));
vi.mock('./useClassUnsyncedScores', () => ({
  useClassUnsyncedScores: () => false,
  classHasUnsyncedScores: async () => false,
}));
const read = vi.hoisted(() => ({ resolve: (_value: string | null) => undefined as void }));
vi.mock('@/features/show-map/resultsVerifiedMutations', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/show-map/resultsVerifiedMutations')>()),
  readServerResultsVerifiedAt: () =>
    new Promise<string | null>(resolve => (read.resolve = resolve)),
}));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: toastError }),
}));

beforeEach(() => {
  releaseMutate.mockReset();
  undo.mockReset();
  toastError.mockReset();
  captured.props = null;
});

const mount = () =>
  render(
    <Routes>
      <Route path="/shows/:id/results" element={<ResultsTab />} />
    </Routes>,
    { initialRoute: '/shows/show-1/results?classId=c1' }
  );

describe('Release after an Undo that started during the server read', () => {
  it('does not queue the release on the stale answer', async () => {
    mount();
    await act(async () => {
      captured.props!.onRelease();
    });
    // The check is taken back while the server is being asked.
    await act(async () => {
      captured.props!.onUndoVerify();
    });
    await act(async () => {
      read.resolve('2026-10-10T15:45:00Z');
    });

    expect(undo).toHaveBeenCalledWith({ classId: 'c1', trialId: 't1' });
    expect(releaseMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      'The check was just changed. Check the class and try again.'
    );
  });

  it('releases normally when nothing changed during the read', async () => {
    mount();
    await act(async () => {
      captured.props!.onRelease();
    });
    await act(async () => {
      read.resolve('2026-10-10T15:45:00Z');
    });

    expect(releaseMutate).toHaveBeenCalledTimes(1);
  });
});
