import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

import { render } from '@/test/utils/testUtils';
import { useResultsSentCheck } from '../useResultsSentCheck';

const mocks = vi.hoisted(() => ({ getChanges: vi.fn() }));

vi.mock('@/services/database/entries/scoreAudit', () => ({
  getFileScoreChangesSince: mocks.getChanges,
}));
vi.mock('@/hooks/mutations/useResultSubmission', () => ({
  useResultSubmissions: () => ({
    data: [{ status: 'sent', organization: 'AKC', submitted_at: '2026-11-14T19:40:00Z' }],
  }),
}));
vi.mock('@/features/results-tab/useClassUnsyncedScores', () => ({
  classHasUnsyncedScores: async () => false,
}));
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { subscribe: () => () => {} },
}));

function Probe({ classes }: { classes: { id: string }[] | null }) {
  const { scoreChanges } = useResultsSentCheck('show-1', classes);
  return <div data-testid="state">{scoreChanges?.status ?? 'none'}</div>;
}

describe('useResultsSentCheck while the schedule loads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getChanges.mockResolvedValue(new Map());
  });

  it('is loading, never an all-clear, while the classes are not ready, and reads nothing', async () => {
    render(<Probe classes={null} />);
    expect(await screen.findByTestId('state')).toHaveTextContent('loading');
    expect(mocks.getChanges).not.toHaveBeenCalled();
  });

  it('reads normally once loaded, including a show with no classes', async () => {
    render(<Probe classes={[]} />);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('read'));
  });
});
