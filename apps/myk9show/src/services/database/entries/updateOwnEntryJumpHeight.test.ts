/**
 * MYK9-561: `updateEntryDetails` — the Edit Entry dialog's jump-height save —
 * must reach the RPC seam, not a direct `entries` UPDATE, and must return the
 * server's SQLSTATE so the dialog can say why.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ updateOwnEntryJumpHeight: vi.fn() }));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { updateOwnEntryJumpHeight: mocks.updateOwnEntryJumpHeight },
}));

import { updateEntryDetails } from './writes';
import { jumpHeightErrorMessage } from './jumpHeightErrors';

describe('updateEntryDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateOwnEntryJumpHeight.mockResolvedValue(undefined);
  });

  it('routes the jump height through the replication RPC seam', async () => {
    const result = await updateEntryDetails({ entryId: 'entry-1', jumpHeight: '16"' });

    expect(mocks.updateOwnEntryJumpHeight).toHaveBeenCalledWith('entry-1', '16"');
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: 'entry-1' });
  });

  it('returns the server SQLSTATE so the dialog can explain the refusal', async () => {
    mocks.updateOwnEntryJumpHeight.mockRejectedValue({
      code: '42501',
      message: 'Entry entry-1 is checked in at the show; ask the secretary to change it',
    });

    const result = await updateEntryDetails({ entryId: 'entry-1', jumpHeight: '16"' });

    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('42501');
    // The exhibitor never sees the row UUID.
    expect(jumpHeightErrorMessage(result.error)).toBe(
      'This jump height can no longer be changed — ask the secretary to change it.'
    );
  });
});

describe('jumpHeightErrorMessage', () => {
  it('passes our own written sentences through and falls back for anything else', () => {
    expect(jumpHeightErrorMessage({ code: 'conflict', message: 'Someone else changed it.' })).toBe(
      'Someone else changed it.'
    );
    expect(jumpHeightErrorMessage({ code: '40001' })).toBe(
      'Someone else changed this entry — reopen it and try again.'
    );
    expect(jumpHeightErrorMessage(null)).toBe(
      "We couldn't update the jump height. Please try again."
    );
  });
});
