/**
 * MYK9-2114: the secretary's note to exhibitors (shows.confirmation_message) travels the
 * replicated show row, so an edit made offline is queued like every other show field.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReplicatedShowsTable, rowToShow, type ReplicatedShow } from '../ReplicatedShowsTable';
import { spyOnWriteAndQueue } from '@/test/utils/spyOnWriteAndQueue';
import type { Database } from '@/types/supabase';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const BASE: ReplicatedShow = {
  id: 'show-1',
  name: 'Fall Trial',
  organization: 'AKC',
  startDate: '2026-11-07T00:00:00+00:00',
  endDate: '2026-11-08T00:00:00+00:00',
};

describe('ReplicatedShowsTable confirmation_message (MYK9-2114)', () => {
  let table: ReplicatedShowsTable;
  let queueMutation: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedShowsTable();
    queueMutation = spyOnWriteAndQueue(table).queue;
    queueMutation.mockResolvedValue('mutation-1');
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  function lastPayload(): Record<string, unknown> {
    return queueMutation.mock.calls.at(-1)?.[2] as Record<string, unknown>;
  }

  it('sends the note to confirmation_message', async () => {
    await table.set(BASE.id, BASE);
    await table.updateShow(BASE.id, { confirmationMessage: 'Park in the north lot.' });
    expect(lastPayload()).toMatchObject({ confirmation_message: 'Park in the north lot.' });
  });

  it('sends null when the note is cleared', async () => {
    await table.set(BASE.id, { ...BASE, confirmationMessage: 'Park in the north lot.' });
    await table.updateShow(BASE.id, { confirmationMessage: null });
    expect(lastPayload()).toHaveProperty('confirmation_message', null);
  });

  it('leaves the note out of an unrelated edit of a row that never held it', async () => {
    await table.set(BASE.id, BASE);
    await table.updateShow(BASE.id, { name: 'Renamed' });
    expect(lastPayload()).not.toHaveProperty('confirmation_message');
  });

  it('reads the column into the replicated row', () => {
    const row = {
      id: 'show-1',
      name: 'Fall Trial',
      organization: 'AKC',
      start_date: '2026-11-07',
      end_date: '2026-11-08',
      confirmation_message: 'Park in the north lot.',
    } as unknown as Database['public']['Tables']['shows']['Row'];
    expect(rowToShow(row).confirmationMessage).toBe('Park in the north lot.');
  });
});
