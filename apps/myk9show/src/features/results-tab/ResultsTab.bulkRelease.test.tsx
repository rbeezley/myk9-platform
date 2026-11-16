/**
 * MYK9-2072: tick classes in the Results list and release them together. Each ticked class goes
 * through the single-class release path; a failure among them is named and the rest stay released.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { render } from '@/test/utils/testUtils';
import type { ResultsClassRow } from './buildResultsClassRows';
import ResultsTab from './ResultsTab';

const makeRow = (id: string, name: string, phase: string, trialLabel = 'Trial 1') =>
  ({
    id,
    trialId: 't1',
    name,
    phase,
    phaseLabel: undefined,
    entries: [],
    tieEntries: [],
    runFinished: true,
    judgeDayKey: 'k',
    judgeSignedOffAt: null,
    releasedAt: null,
    takesJudgeSignOff: false,
    statusCompleted: true,
    resultsCanonical: 'x',
    trialLabel,
    judgeName: 'Judge J',
    scoredCount: 3,
    expectedCount: 3,
    nextAction: { kind: 'detail', label: 'Release' },
  }) as unknown as ResultsClassRow;

const rows = vi.hoisted(() => ({ list: [] as ResultsClassRow[] }));
const failIds = vi.hoisted(() => ({ set: new Set<string>() }));

vi.mock('./useResultsTabData', () => ({
  useResultsTabData: () => ({
    rows: rows.list,
    entries: [],
    trials: [],
    readState: 'ready',
    isNationals: false,
    rankingKeyState: 'ready' as const,
    refreshFailed: false,
    paperworkAvailable: true,
    retry: vi.fn(),
  }),
}));
vi.mock('./ResultsClassDetail', () => ({ ResultsClassDetail: () => null }));
vi.mock('./ResultsTabToolbar', () => ({ ResultsTabToolbar: () => null }));
vi.mock('./ResultsVisibilitySheet', () => ({ ResultsVisibilitySheet: () => null }));
vi.mock('./ResultsPackets', () => ({ ResultsPackets: () => null }));
const releaseMutate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/mutations/useReleaseResults', () => ({
  useReleaseResults: () => ({ mutateAsync: releaseMutate, isPending: false }),
}));
vi.mock('@/features/show-map/useResultsVerifiedMutations', () => ({
  useResultsVerifiedMutations: () => ({
    verifyAsync: vi.fn().mockResolvedValue(undefined),
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
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u' } }) }));
vi.mock('./useClassUnsyncedScores', () => ({
  useClassUnsyncedScores: () => false,
  classHasUnsyncedScores: async () => false,
}));
vi.mock('./useClassRowSyncState', async importOriginal => ({
  ...(await importOriginal<typeof import('./useClassRowSyncState')>()),
  useClassRowSyncState: () => 'settled',
  readClassRowSyncState: async () => 'settled',
}));
vi.mock('@/features/show-map/resultsVerifiedMutations', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/show-map/resultsVerifiedMutations')>()),
  readServerResultsVerifiedAt: async () => '2026-10-10T15:45:00Z',
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

beforeEach(() => {
  releaseMutate.mockReset();
  releaseMutate.mockImplementation(async (input: { classIds: string[] }) => ({
    released: failIds.set.has(input.classIds[0]!) ? [] : input.classIds,
    failed: [],
  }));
  failIds.set = new Set();
  rows.list = [
    makeRow('c1', 'Containers Novice', 'ready-to-release'),
    makeRow('c2', 'Interior Novice', 'ready-to-release', 'Trial 2'),
    makeRow('c3', 'Exterior Novice', 'ready-to-release'),
    makeRow('c4', 'Buried Novice', 'in-ring'),
    makeRow('c5', 'Vehicle Novice', 'needs-checking'),
  ];
});

const mount = () =>
  render(
    <Routes>
      <Route path="/shows/:id/results" element={<ResultsTab />} />
    </Routes>,
    { initialRoute: '/shows/show-1/results?status=all' }
  );

describe('Release checked classes', () => {
  it('puts a tick box only on classes the single-class Release would release, and no select all', () => {
    mount();
    const boxes = screen.getAllByRole('checkbox').map(box => box.getAttribute('aria-label'));
    expect(boxes).toEqual([
      'Release Containers Novice, Trial 1',
      'Release Interior Novice, Trial 2',
      'Release Exterior Novice, Trial 1',
      'Release Vehicle Novice, Trial 1',
    ]);
    expect(screen.queryByRole('button', { name: /release \d+ class/i })).not.toBeInTheDocument();
  });

  it('names exactly the ticked classes and says the scores are matched to the paper sheets', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('checkbox', { name: /Containers Novice/ }));
    await user.click(screen.getByRole('checkbox', { name: /Interior Novice/ }));
    await user.click(screen.getByRole('button', { name: 'Release 2 classes' }));

    const dialog = await screen.findByRole('dialog');
    const items = within(dialog)
      .getAllByRole('listitem')
      .map(li => li.textContent);
    expect(items).toEqual(['Containers Novice, Trial 1', 'Interior Novice, Trial 2']);
    expect(dialog).toHaveTextContent(/scores match the judge's paper sheets/);
    expect(releaseMutate).not.toHaveBeenCalled();
  });

  it('releases each ticked class through the single-class write, one at a time', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('checkbox', { name: /Containers Novice/ }));
    await user.click(screen.getByRole('checkbox', { name: /Exterior Novice/ }));
    await user.click(screen.getByRole('button', { name: 'Release 2 classes' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Release 2 classes' })
    );

    await waitFor(() => expect(releaseMutate).toHaveBeenCalledTimes(2));
    expect(releaseMutate.mock.calls.map(call => call[0])).toEqual([
      { classIds: ['c1'], showId: 'show-1' },
      { classIds: ['c3'], showId: 'show-1' },
    ]);
  });

  it('names the one class that failed among three and leaves the other two released', async () => {
    failIds.set = new Set(['c2']);
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('checkbox', { name: /Containers Novice/ }));
    await user.click(screen.getByRole('checkbox', { name: /Interior Novice/ }));
    await user.click(screen.getByRole('checkbox', { name: /Exterior Novice/ }));
    await user.click(screen.getByRole('button', { name: 'Release 3 classes' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Release 3 classes' })
    );

    const dialog = await screen.findByText('1 class was not released');
    const box = dialog.closest('[role="dialog"]') as HTMLElement;
    expect(box).toHaveTextContent('Interior Novice, Trial 2');
    expect(box).toHaveTextContent('2 released');
    expect(box).not.toHaveTextContent('Containers Novice');
    expect(releaseMutate).toHaveBeenCalledTimes(3);
    // Only the failed class stays ticked.
    await user.click(within(box).getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Release 1 class' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Interior Novice/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Containers Novice/ })).not.toBeChecked();
  });

  it('keeps the dialog list fixed while it runs, and stops after the class in flight when the tab is left', async () => {
    const gate: { open: (value: { released: string[]; failed: string[] }) => void } = {
      open: () => undefined,
    };
    releaseMutate.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          gate.open = resolve;
        })
    );
    const user = userEvent.setup();
    const { unmount } = mount();
    await user.click(screen.getByRole('checkbox', { name: /Containers Novice/ }));
    await user.click(screen.getByRole('checkbox', { name: /Interior Novice/ }));
    await user.click(screen.getByRole('button', { name: 'Release 2 classes' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Release 2 classes' }));
    await waitFor(() => expect(releaseMutate).toHaveBeenCalledTimes(1));

    // Mid-run the list and count in the dialog still name both classes.
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2);
    expect(within(dialog).getByRole('button', { name: 'Releasing…' })).toBeDisabled();

    unmount();
    gate.open({ released: ['c1'], failed: [] });
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(releaseMutate).toHaveBeenCalledTimes(1);
  });
});
