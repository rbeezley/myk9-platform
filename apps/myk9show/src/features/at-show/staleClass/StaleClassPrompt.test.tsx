import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  queued: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, info: mocks.toastInfo, error: mocks.toastError },
}));
vi.mock('./completeStaleClassRpc', () => ({
  completeStaleClassRpc: mocks.complete,
  readQueuedScoreEntryIds: mocks.queued,
}));

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
    mocks.queued.mockResolvedValue(new Set<string>());
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
    expect(mocks.complete).toHaveBeenCalledWith('show', 'stale', ['a', 'b', 'c']);
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(useStaleClassPromptStore.getState().prompt).toBeNull();
  });

  it('re-asks with the server list when the class changed, then confirms that list', async () => {
    mocks.complete
      .mockResolvedValueOnce({
        ok: false,
        currentEntryIds: ['a', 'b', 'c', 'd'],
        reason: 'changed',
      })
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
    expect(mocks.complete).toHaveBeenLastCalledWith('show', 'stale', ['a', 'b', 'c', 'd']);
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(useStaleClassPromptStore.getState().prompt).toBeNull();
  });

  it('closes when the server finds no unscored dogs left', async () => {
    mocks.complete.mockResolvedValue({ ok: false, currentEntryIds: [], reason: 'changed' });
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() =>
      expect(mocks.toastInfo).toHaveBeenCalledWith('Container Novice A has no unscored dogs left')
    );
    expect(useStaleClassPromptStore.getState().prompt).toBeNull();
    expect(mocks.complete).toHaveBeenCalledTimes(1);
  });

  it('keeps the prompt up and tells the judge when the call fails', async () => {
    mocks.complete.mockRejectedValue(
      Object.assign(new Error('permission denied'), { code: '42501' })
    );
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(useStaleClassPromptStore.getState().prompt).not.toBeNull();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('stays open with a connection message when the request cannot reach the server', async () => {
    mocks.complete.mockRejectedValue(new TypeError('Failed to fetch'));
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Needs a connection. Try again when you're back online."
      )
    );
    expect(navigator.onLine).toBe(true);
    expect(useStaleClassPromptStore.getState().prompt).not.toBeNull();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('says a dog is in the ring and snoozes, rather than claiming the class is complete', async () => {
    mocks.complete.mockResolvedValue({ ok: false, currentEntryIds: [], reason: 'in_ring' });
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() =>
      expect(mocks.toastInfo).toHaveBeenCalledWith(expect.stringMatching(/dog is in the ring/))
    );
    expect(mocks.toastInfo).not.toHaveBeenCalledWith(expect.stringMatching(/no unscored/));
    expect(useStaleClassPromptStore.getState().prompt).toBeNull();
    expect(useStaleClassPromptStore.getState().snoozes.stale).toBeDefined();
  });

  it('says the class is no longer in progress when a secretary changed it', async () => {
    mocks.complete.mockResolvedValue({ ok: false, currentEntryIds: [], reason: 'not_in_progress' });
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() =>
      expect(mocks.toastInfo).toHaveBeenCalledWith('Container Novice A is no longer in progress')
    );
  });

  it('keeps the prompt and writes nothing while a listed dog still has a score uploading', async () => {
    mocks.queued.mockResolvedValue(new Set(['b']));
    useStaleClassPromptStore.setState({ prompt });
    render(<StaleClassPrompt />);

    await userEvent.click(await screen.findByRole('button', { name: /Mark absent/ }));

    await waitFor(() =>
      expect(mocks.toastInfo).toHaveBeenCalledWith(
        "Scores for Container Novice A are still uploading. Try again once they're sent."
      )
    );
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(useStaleClassPromptStore.getState().prompt).not.toBeNull();
  });
});
