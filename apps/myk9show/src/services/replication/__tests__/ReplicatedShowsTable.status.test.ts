/**
 * MYK9-983: a full-row show UPDATE (a fresh edit, or the rebuild that replaces
 * a queued delta after a newer server version) must write the show's own
 * status. `mapShowStatusToDb` used to fall through to 'draft' for `upcoming`,
 * unpublishing the show.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReplicatedShowsTable, type ReplicatedShow } from '../ReplicatedShowsTable';
import { SHOW_DB_STATUSES, mapShowStatusToDb } from '../showStatusMapping';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

type QueueMutation = (
  operation: string,
  rowId: string,
  payload: Record<string, unknown>
) => Promise<string | null>;

// Every value in shows' status CHECK (live constraint, 2026-10-03).
const CHECK_STATUSES = ['draft', 'published', 'upcoming', 'in_progress', 'completed', 'cancelled'];

function showWithStatus(status: string): ReplicatedShow {
  return {
    id: 'show-1',
    name: 'Fall Trial',
    organization: 'AKC',
    startDate: '2026-11-07T00:00:00+00:00',
    endDate: '2026-11-08T00:00:00+00:00',
    status,
  };
}

describe('mapShowStatusToDb', () => {
  it('lists exactly the CHECK statuses', () => {
    expect([...SHOW_DB_STATUSES].sort()).toEqual([...CHECK_STATUSES].sort());
  });

  it.each(CHECK_STATUSES)('maps %s to itself', status => {
    expect(mapShowStatusToDb(status)).toBe(status);
  });

  it.each([
    ['unpublished', 'draft'],
    ['In Progress', 'in_progress'],
    ['Completed', 'completed'],
    ['Cancelled', 'cancelled'],
  ])('maps the app spelling %s to %s', (appStatus, dbStatus) => {
    expect(mapShowStatusToDb(appStatus)).toBe(dbStatus);
  });

  it('starts a show with no status as draft', () => {
    expect(mapShowStatusToDb(undefined)).toBe('draft');
    expect(mapShowStatusToDb(null)).toBe('draft');
  });

  it.each(['accepting_entries', 'closed', 'bogus', ''])('throws on %j', status => {
    expect(() => mapShowStatusToDb(status)).toThrow(/Unknown show status/);
  });
});

describe('ReplicatedShowsTable status on full-row writes', () => {
  let table: ReplicatedShowsTable;
  let queueMutation: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedShowsTable();
    queueMutation = vi.spyOn(table as unknown as { queueMutation: QueueMutation }, 'queueMutation');
    queueMutation.mockResolvedValue('mutation-1');
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  const rebuild = (show: ReplicatedShow) =>
    (
      table as unknown as { rebuildUpdatePayload: (s: ReplicatedShow) => Record<string, unknown> }
    ).rebuildUpdatePayload(show);

  it.each(CHECK_STATUSES)('keeps %s on a name-only edit', async status => {
    await table.set('show-1', showWithStatus(status));
    await table.updateShow('show-1', { name: 'Renamed' });
    expect(queueMutation).toHaveBeenCalledWith(
      'UPDATE',
      'show-1',
      expect.objectContaining({ name: 'Renamed', status })
    );
  });

  it.each(CHECK_STATUSES)('keeps %s when a queued edit is rebuilt after a conflict', status => {
    expect(rebuild(showWithStatus(status))).toMatchObject({ status });
  });

  it('omits an unmappable status from a rebuild instead of throwing or writing draft', () => {
    const payload = rebuild(showWithStatus('accepting_entries'));
    expect(payload).not.toHaveProperty('status');
    expect(payload).toMatchObject({ name: 'Fall Trial' });
  });
});
