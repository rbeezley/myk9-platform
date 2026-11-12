/**
 * MYK9-1847: the post-save "up next" chips never offer a dog from a cancelled section, so a
 * tap cannot land on a scoresheet that takes no score.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedClassesTable } from '@/services/replication';
import { QuickAdvancePanel } from './quickAdvancePanel';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByClass: vi.fn(),
    getEntryById: vi.fn().mockResolvedValue(null),
    getScoreUploadState: vi.fn(),
    readScoreFromServer: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  },
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { subscribe: vi.fn() },
}));

function row(id: string, classId: string, name: string, runOrder: number) {
  return {
    id,
    classId,
    armband: String(100 + runOrder),
    dogCallName: name,
    dogBreed: 'Border Collie',
    checkInStatus: 'no-status',
    runOrder,
    isScored: false,
  };
}

function renderPanel() {
  return render(
    <QuickAdvancePanel
      classId="class-a"
      pairedClassId="class-b"
      scoredEntryId="scored"
      onBackToList={vi.fn()}
      onCorrectScore={vi.fn()}
      onPickEntry={vi.fn()}
    />
  );
}

describe('QuickAdvancePanel chips with a cancelled section (MYK9-1847)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockImplementation(
      async (id: string) =>
        (id === 'class-a'
          ? [row('a1', 'class-a', 'Rex', 1)]
          : [row('b1', 'class-b', 'Bella', 2), row('b2', 'class-b', 'Biscuit', 3)]) as never
    );
  });

  function classRows(statusB: string) {
    vi.mocked(replicatedClassesTable.subscribe).mockImplementation(listener => {
      listener([
        { id: 'class-a', classStatus: 'in_progress' },
        { id: 'class-b', classStatus: statusB },
      ] as never);
      return () => undefined;
    });
  }

  it('offers only the running section dogs when section B is cancelled', async () => {
    classRows('cancelled');
    renderPanel();

    await screen.findByText(/Rex/);
    await waitFor(() => expect(screen.getAllByTestId('quick-advance-entry')).toHaveLength(1));
    expect(screen.queryByText(/Bella/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Biscuit/)).not.toBeInTheDocument();
  });

  it('offers both sections again when nothing is cancelled', async () => {
    classRows('in_progress');
    renderPanel();

    await waitFor(() => expect(screen.getAllByTestId('quick-advance-entry')).toHaveLength(3));
  });
});
