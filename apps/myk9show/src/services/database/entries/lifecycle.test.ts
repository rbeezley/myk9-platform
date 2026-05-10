import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptEntry,
  rejectEntry,
  scratchEntry,
  setEntryLifecycleStatus,
  transitionEntryLifecycle,
  waitlistEntry,
} from './lifecycle';

const { updateEntryStatus } = vi.hoisted(() => ({
  updateEntryStatus: vi.fn(),
}));

vi.mock('./secretary', () => ({
  updateEntryStatus: (...args: unknown[]) => updateEntryStatus(...args),
}));

describe('Entry lifecycle transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateEntryStatus.mockResolvedValue({ data: { id: 'entry-1' }, error: null });
  });

  it('sets an explicit lifecycle status through one seam', async () => {
    await setEntryLifecycleStatus({
      entryId: 'entry-1',
      status: 'withdrawn',
      reason: 'Handler conflict',
    });

    expect(updateEntryStatus).toHaveBeenCalledWith('entry-1', 'withdrawn', 'Handler conflict');
  });

  it('accepts an Entry by writing confirmed', async () => {
    await acceptEntry('entry-1');

    expect(updateEntryStatus).toHaveBeenCalledWith('entry-1', 'confirmed', undefined);
  });

  it('rejects an Entry using the existing withdrawn transition behavior', async () => {
    await rejectEntry('entry-1', 'Class limit reached');

    expect(updateEntryStatus).toHaveBeenCalledWith('entry-1', 'withdrawn', 'Class limit reached');
  });

  it('scratches an Entry and preserves the reason', async () => {
    await scratchEntry('entry-1', 'Dog is absent');

    expect(updateEntryStatus).toHaveBeenCalledWith('entry-1', 'scratched', 'Dog is absent');
  });

  it('keeps current wait-list decision behavior behind a named transition', async () => {
    await waitlistEntry('entry-1');

    expect(updateEntryStatus).toHaveBeenCalledWith('entry-1', 'confirmed', undefined);
  });

  it('routes transition actions through the same explicit status seam', async () => {
    await transitionEntryLifecycle({ entryId: 'entry-1', action: 'scratch', reason: 'Absent' });

    expect(updateEntryStatus).toHaveBeenCalledWith('entry-1', 'scratched', 'Absent');
  });
});
