import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/services/database/supabaseClient', async () => {
  const { createDatabaseError } = await import('@/services/database/databaseError');
  return { supabase: { rpc }, createDatabaseError };
});
vi.mock('@/services/database/entries/secretary', () => ({ updateEntryStatus: vi.fn() }));
vi.mock('@/services/replication', () => ({ replicatedEntriesTable: {} }));
vi.mock('./entryStatusAudit', () => ({ logReplicatedEntryStatusChange: vi.fn() }));

import { StaleCheckInError, isStaleCheckIn, updateSelfCheckInStatus } from './checkInStatus';

describe('updateSelfCheckInStatus (MYK9-1911)', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('sends no expectation when the caller has none', async () => {
    rpc.mockResolvedValue({ error: null });
    await updateSelfCheckInStatus('e1', 'checked-in');
    expect(rpc).toHaveBeenCalledWith('self_checkin_entry', {
      p_entry_id: 'e1',
      p_new_status: 'checked-in',
    });
  });

  it('sends the status and Pull source an Undo expects to replace', async () => {
    rpc.mockResolvedValue({ error: null });
    await updateSelfCheckInStatus('e1', 'checked-in', {
      status: 'pulled',
      pullSource: 'exhibitor',
    });
    expect(rpc).toHaveBeenCalledWith('self_checkin_entry', {
      p_entry_id: 'e1',
      p_new_status: 'checked-in',
      p_expected_status: 'pulled',
      p_expected_pull_source: 'exhibitor',
    });
  });

  it('turns the server refusal (MK911) into a permanent StaleCheckInError', async () => {
    rpc.mockResolvedValue({ error: { code: 'MK911', message: 'Entry e1 status changed' } });
    const failure = await updateSelfCheckInStatus('e1', 'checked-in', {
      status: 'pulled',
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(StaleCheckInError);
    expect(isStaleCheckIn(failure)).toBe(true);
  });

  it('leaves other failures as database errors', async () => {
    rpc.mockResolvedValue({ error: { code: 'P0001', message: 'Not authorized' } });
    const failure = await updateSelfCheckInStatus('e1', 'checked-in').catch((e: unknown) => e);
    expect(isStaleCheckIn(failure)).toBe(false);
    expect(failure).toMatchObject({ code: 'P0001' });
  });

  it('finds the refusal behind a wrapper error', () => {
    const wrapped = Object.assign(new Error('We could not save'), {
      cause: new StaleCheckInError(),
    });
    expect(isStaleCheckIn(wrapped)).toBe(true);
  });
});
