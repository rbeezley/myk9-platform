import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RingsideReplication } from '@myk9/ringside';
import { act, render, screen, waitFor } from '@/test/utils/testUtils';

const classes = vi.hoisted(() => ({
  rows: {} as Record<string, { classStatus: string; isScoringFinalized: boolean } | null>,
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: vi.fn(async (id: string) => classes.rows[id] ?? null),
  },
}));

import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { MarkClassCompleteOffer } from './MarkClassCompleteOffer';

const allScored = { pending: 0, completed: 6 };

function renderOffer(
  classIds: string[],
  replication: RingsideReplication,
  refresh = vi.fn(async () => {})
) {
  return render(
    <MarkClassCompleteOffer
      classIds={classIds}
      statusCounts={allScored}
      canManage
      replication={replication}
      refresh={refresh}
      version={1}
    />
  );
}

describe('MarkClassCompleteOffer (MYK9-2013)', () => {
  beforeEach(() => {
    classes.rows = {
      'class-1': { classStatus: 'in_progress', isScoringFinalized: false },
      'class-2': { classStatus: 'completed', isScoringFinalized: true },
    };
  });

  it('marks the class complete in one tap, with the Status dialog’s own write', async () => {
    const updateClassStatus = vi.fn(async () => {});
    const refresh = vi.fn(async () => {});
    const { user } = renderOffer(['class-1'], { updateClassStatus }, refresh);

    expect(await screen.findByText('Every dog has a result.')).toBeVisible();
    await user.click(await screen.findByRole('button', { name: 'Mark class complete' }));

    await waitFor(() => expect(updateClassStatus).toHaveBeenCalledWith('class-1', 'completed'));
    expect(updateClassStatus).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('on a combined list writes only the section still open', async () => {
    const updateClassStatus = vi.fn(async () => {});
    const { user } = renderOffer(['class-2', 'class-1'], { updateClassStatus });

    await user.click(await screen.findByRole('button', { name: 'Mark class complete' }));

    await waitFor(() => expect(updateClassStatus).toHaveBeenCalledWith('class-1', 'completed'));
    expect(updateClassStatus).not.toHaveBeenCalledWith('class-2', 'completed');
  });

  it('is not offered once the class completed by itself', async () => {
    classes.rows['class-1'] = { classStatus: 'in_progress', isScoringFinalized: true };
    renderOffer(['class-1'], { updateClassStatus: vi.fn() });
    // The replica answered (a finalized class) before absence is asserted.
    await waitFor(() =>
      expect(replicatedClassesTable.getClassById).toHaveBeenCalledWith('class-1')
    );
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Mark class complete' })).not.toBeInTheDocument();
  });

  it('says so when the write fails, and keeps the button', async () => {
    const updateClassStatus = vi.fn(async () => {
      throw new Error('replica write failed');
    });
    const { user } = renderOffer(['class-1'], { updateClassStatus });

    await user.click(await screen.findByRole('button', { name: 'Mark class complete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not mark the class complete. Try again.'
    );
    expect(screen.getByRole('button', { name: 'Mark class complete' })).toBeEnabled();
  });
});
