import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  submitScore: vi.fn(),
  getEntryById: vi.fn(),
  recheck: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
  getClassById: vi.fn(),
  updateClassStatus: vi.fn(),
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
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getClassById: mocks.getClassById },
}));
vi.mock('../ringsideCapabilities', () => ({
  buildRingsideReplication: () => ({ updateClassStatus: mocks.updateClassStatus }),
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
    mocks.getClassById.mockResolvedValue({
      id: 'stale',
      statusSource: 'derived',
      classStatus: 'in_progress',
    });
    mocks.updateClassStatus.mockResolvedValue(undefined);
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

  const freshHit = {
    classId: 'stale',
    className: 'Container Novice A',
    unscoredEntryIds: ['b', 'c'],
    lastResultAtMs: 0,
  };

  it('completes a manually controlled class through the status write', async () => {
    mocks.recheck.mockResolvedValue(freshHit);
    mocks.getClassById.mockResolvedValue({
      id: 'stale',
      statusSource: 'manual',
      classStatus: 'in_progress',
    });
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() => expect(mocks.updateClassStatus).toHaveBeenCalledWith('stale', 'completed'));
  });

  it('does not touch the status of a server-derived class', async () => {
    mocks.recheck.mockResolvedValue(freshHit);
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.updateClassStatus).not.toHaveBeenCalled();
  });

  it('keeps the prompt as a retry after a partial failure', async () => {
    mocks.recheck.mockResolvedValue(freshHit);
    mocks.submitScore
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(async (options: { onError: (e: Error) => void }) => {
        options.onError(new Error('queue full'));
      });
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(useStaleClassPromptStore.getState().prompt?.retry).toBe(true);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('says the dogs are only saved on this device while offline', async () => {
    mocks.recheck.mockResolvedValue(freshHit);
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.toastSuccess.mock.calls[0]?.[0]).toMatch(/on this device.*back online/);
    expect(mocks.toastSuccess.mock.calls[0]?.[0]).not.toMatch(/completed/);
    online.mockRestore();
  });
});
