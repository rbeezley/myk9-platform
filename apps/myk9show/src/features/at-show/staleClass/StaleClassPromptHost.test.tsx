import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useOptimisticScoring', () => ({
  useOptimisticScoring: () => ({ submitScoreOptimistically: vi.fn() }),
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getEntryById: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getClassById: vi.fn() },
}));
vi.mock('../ringsideCapabilities', () => ({
  buildRingsideReplication: () => ({ updateClassStatus: vi.fn() }),
}));
vi.mock('./checkStaleClass', () => ({ recheckStaleClass: vi.fn() }));

import { render, screen } from '@/test/utils/testUtils';
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
    render(<StaleClassPromptHost />);
    expect(await screen.findByText(/has 3 dogs not scored/)).toBeTruthy();
  });
});
