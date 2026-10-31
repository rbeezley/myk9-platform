import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./completeStaleClassRpc', () => ({ completeStaleClassRpc: vi.fn() }));

import { render, screen, waitFor } from '@/test/utils/testUtils';
import { StaleClassPromptHost } from './StaleClassPromptHost';
import { useStaleClassPromptStore } from './staleClassPromptStore';

describe('StaleClassPromptHost', () => {
  beforeEach(() => {
    useStaleClassPromptStore.setState({ prompt: null, snoozes: {} });
  });

  it('renders nothing while there is no prompt', () => {
    render(<StaleClassPromptHost />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('loads and shows the prompt once one is offered', async () => {
    useStaleClassPromptStore.setState({
      prompt: {
        classId: 'stale',
        className: 'Container Novice A',
        unscoredEntryIds: ['a', 'b', 'c'],
        lastResultAtMs: 0,
        showId: 'show',
        trialId: 'trial',
        scoredClassId: 'other',
      },
    });
    render(<StaleClassPromptHost />, { initialRoute: '/at-show/show/class/other' });
    expect(await screen.findByText(/has 3 dogs not scored/)).toBeTruthy();
  });

  it('drops a prompt from another show instead of showing it', async () => {
    useStaleClassPromptStore.setState({
      prompt: {
        classId: 'stale',
        className: 'Container Novice A',
        unscoredEntryIds: ['a'],
        lastResultAtMs: 0,
        showId: 'show-a',
        trialId: 'trial',
        scoredClassId: 'other',
      },
    });
    render(<StaleClassPromptHost />, { initialRoute: '/at-show/show-b' });
    await waitFor(() => expect(useStaleClassPromptStore.getState().prompt).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
