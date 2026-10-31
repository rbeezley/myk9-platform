import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  submitScore: vi.fn(),
  getEntryById: vi.fn(),
  recheck: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, info: mocks.toastInfo, error: mocks.toastError },
}));
vi.mock('@/hooks/useOptimisticScoring', () => ({
  useOptimisticScoring: () => ({ submitScoreOptimistically: mocks.submitScore }),
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getEntryById: mocks.getEntryById },
}));
vi.mock('./checkStaleClass', () => ({ recheckStaleClass: mocks.recheck }));

import { render, screen, userEvent, waitFor } from '@/test/utils/testUtils';
import { StaleClassPrompt } from './StaleClassPrompt';
import { useStaleClassPromptStore } from './staleClassPromptStore';

const prompt = {
  classId: 'stale',
  className: 'Container Novice A',
  unscoredEntryIds: ['a', 'b', 'c'],
  lastResultAtMs: 0,
  showId: 'show',
  trialId: 'trial',
  scoredClassId: 'other',
};

describe('StaleClassPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStaleClassPromptStore.setState({ prompt: null, snoozes: {} });
    mocks.getEntryById.mockResolvedValue({ armband: '101' });
    mocks.submitScore.mockResolvedValue(undefined);
  });

  it('renders nothing until there is a prompt', () => {
    render(<StaleClassPrompt />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks with the dog count and writes nothing on "Not yet"', async () => {
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    expect(await screen.findByText(/has 3 dogs not scored/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Not yet' }));

    expect(mocks.submitScore).not.toHaveBeenCalled();
    expect(useStaleClassPromptStore.getState().prompt).toBeNull();
    expect(useStaleClassPromptStore.getState().snoozes.stale).toBeDefined();
  });

  it('marks the re-checked dogs absent and says what happened', async () => {
    mocks.recheck.mockResolvedValue({
      classId: 'stale',
      className: 'Container Novice A',
      unscoredEntryIds: ['b', 'c'],
      lastResultAtMs: 0,
    });
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        'Container Novice A completed, 2 marked absent',
        expect.anything()
      )
    );
    expect(mocks.submitScore).toHaveBeenCalledTimes(2);
    expect(mocks.submitScore).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: 'b',
        classId: 'stale',
        armband: 101,
        scoreData: expect.objectContaining({ resultText: 'ABS' }),
      })
    );
    expect(useStaleClassPromptStore.getState().prompt).toBeNull();
  });

  it('writes nothing when the fresh check says the class is already settled', async () => {
    mocks.recheck.mockResolvedValue(null);
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() => expect(mocks.toastInfo).toHaveBeenCalled());
    expect(mocks.submitScore).not.toHaveBeenCalled();
  });
});
