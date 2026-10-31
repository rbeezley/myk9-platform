import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  queue: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, info: mocks.toastInfo, error: mocks.toastError },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { queueCompleteStaleClass: mocks.queue },
}));
vi.mock('./completeStaleClassRpc', () => ({ completeStaleClassRpc: mocks.complete }));

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
    mocks.complete.mockResolvedValue({ ok: true, markedCount: 3 });
    mocks.queue.mockResolvedValue(undefined);
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

    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(useStaleClassPromptStore.getState().prompt).toBeNull();
    expect(useStaleClassPromptStore.getState().snoozes.stale).toBeDefined();
  });

  it('sends the one call with the ids the judge saw and says what happened', async () => {
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        'Container Novice A completed, 3 marked absent',
        expect.anything()
      )
    );
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledWith('stale', ['a', 'b', 'c']);
    expect(useStaleClassPromptStore.getState().prompt).toBeNull();
  });

  it('re-asks with the server list when the class changed, then confirms that list', async () => {
    mocks.complete
      .mockResolvedValueOnce({ ok: false, currentEntryIds: ['a', 'b', 'c', 'd'] })
      .mockResolvedValueOnce({ ok: true, markedCount: 4 });
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    expect(await screen.findByText(/has 4 dogs not scored/)).toBeTruthy();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(useStaleClassPromptStore.getState().prompt?.unscoredEntryIds).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);

    await userEvent.click(screen.getByRole('button', { name: /Mark absent/ }));

    await waitFor(() => expect(mocks.complete).toHaveBeenCalledTimes(2));
    expect(mocks.complete).toHaveBeenLastCalledWith('stale', ['a', 'b', 'c', 'd']);
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(useStaleClassPromptStore.getState().prompt).toBeNull();
  });

  it('closes quietly when the server finds no dogs left', async () => {
    mocks.complete.mockResolvedValue({ ok: false, currentEntryIds: [] });
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() => expect(mocks.toastInfo).toHaveBeenCalled());
    expect(useStaleClassPromptStore.getState().prompt).toBeNull();
  });

  it('keeps the prompt up and tells the judge when the call fails', async () => {
    mocks.complete.mockRejectedValue(new Error('network'));
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(useStaleClassPromptStore.getState().prompt).not.toBeNull();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('queues one call while offline and says it completes when back online', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.queue).toHaveBeenCalledTimes(1);
    expect(mocks.queue).toHaveBeenCalledWith('stale', ['a', 'b', 'c']);
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.toastSuccess.mock.calls[0]?.[0]).toMatch(/back online/);
    online.mockRestore();
  });
});
