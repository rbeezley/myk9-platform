import { Routes, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@/test/utils/testUtils';

const harness = vi.hoisted(() => ({
  load: vi.fn(),
  saveEntry: vi.fn(),
  selectEntry: vi.fn(),
}));

vi.mock('./useScoringBreadcrumb', () => ({
  useScoringBreadcrumb: () => ({ isLoading: true, showId: 'show-1' }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('@/features/show-map/cockpit/ShowDeskReturnLink', () => ({
  ShowDeskReturnLink: () => null,
}));
vi.mock('./components/SessionToolbar', () => ({ SessionToolbar: () => null }));
vi.mock('./components/SequentialView', () => ({ SequentialView: () => null }));
vi.mock('./components/SplitPanelView', () => ({
  SplitPanelView: ({ onSaveAndNext }: { onSaveAndNext: (...args: unknown[]) => unknown }) => (
    <button type="button" onClick={() => void onSaveAndNext('Q', '2000', 0)}>
      save and next
    </button>
  ),
}));
vi.mock('./hooks/usePaperScoring', () => ({
  usePaperScoring: () => ({
    mode: 'split',
    setMode: vi.fn(),
    selectedEntryId: 'e1',
    selectEntry: harness.selectEntry,
    sessionSettings: {},
    setSessionSettings: vi.fn(),
    saveEntry: harness.saveEntry,
    clearEntry: vi.fn(),
    isSaving: false,
  }),
}));
vi.mock('./paperScoresheetData', () => ({ loadEntriesWithDogs: harness.load }));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: vi.fn().mockResolvedValue({ id: 'class-1', name: 'Container Novice' }),
  },
}));

import { PaperScoresheetPage } from './PaperScoresheetPage';

const dog = (entryId: string, exhibitorOrder: number) => ({
  entryId,
  exhibitorOrder,
  isScored: false,
  status: 'pending',
  classId: 'class-1',
  dogId: `dog-${entryId}`,
  callName: entryId,
  handler: '',
  breed: '',
  armband: exhibitorOrder,
  inRing: false,
});

/**
 * MYK9-774: the class read now throws on a failed device read. After a landed
 * save, a list that cannot refresh still shows the saved dog as unscored, so
 * "save and next" could route the judge back to it. Scoring pauses instead,
 * with a way to try the read again.
 */
describe('PaperScoresheetPage — the list cannot refresh after a save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.saveEntry.mockResolvedValue(undefined);
  });

  it('pauses scoring with a retry, then moves on to the next dog once the list reads', async () => {
    harness.load
      .mockResolvedValueOnce([dog('e1', 1), dog('e2', 2)])
      .mockRejectedValueOnce(new Error('Could not read entries on this device'))
      .mockResolvedValueOnce([{ ...dog('e1', 1), isScored: true, status: 'scored' }, dog('e2', 2)]);

    render(
      <Routes>
        <Route path="/paper/:classId" element={<PaperScoresheetPage />} />
      </Routes>,
      { initialRoute: '/paper/class-1' }
    );
    fireEvent.click(await screen.findByRole('button', { name: 'save and next' }));

    expect(await screen.findByText(/couldn't refresh on this device/)).toBeInTheDocument();
    expect(harness.saveEntry).toHaveBeenCalledTimes(1);
    // The stale list still shows e1 unscored; advancing would pick e2 from it.
    expect(harness.selectEntry).not.toHaveBeenCalledWith('e2');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'save and next' })).toBeInTheDocument();
    await waitFor(() => expect(harness.load).toHaveBeenCalledTimes(3));
    // The retry finishes the interrupted advance: the next unscored dog.
    await waitFor(() => expect(harness.selectEntry).toHaveBeenLastCalledWith('e2'));
  });
});
