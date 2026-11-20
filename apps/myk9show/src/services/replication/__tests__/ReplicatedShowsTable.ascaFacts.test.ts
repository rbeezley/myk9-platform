/**
 * MYK9-2290: the ASCA premium facts (shows.asca_sanction_status, scents_by_level,
 * spectators_policy, photographer_contact) travel the replicated show row, so an edit made
 * offline is queued like every other show field and reads back the same.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReplicatedShowsTable, rowToShow, type ReplicatedShow } from '../ReplicatedShowsTable';
import { spyOnWriteAndQueue } from '@/test/utils/spyOnWriteAndQueue';
import { mapReplicatedShowToDbRow, mapShowInputToUpdate } from '@/services/mappers/showMappers';
import type { Database } from '@/types/supabase';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const BASE: ReplicatedShow = {
  id: 'show-1',
  name: 'Fall Trial',
  organization: 'ASCA',
  startDate: '2026-11-07T00:00:00+00:00',
  endDate: '2026-11-08T00:00:00+00:00',
};

const FACTS = {
  ascaSanctionStatus: 'approved',
  scentsByLevel: 'Novice birch; Open birch and anise',
  spectatorsPolicy: 'not_allowed',
  photographerContact: 'Pat, 555-0100',
} as const;

const FACT_COLUMNS = {
  asca_sanction_status: 'approved',
  scents_by_level: 'Novice birch; Open birch and anise',
  spectators_policy: 'not_allowed',
  photographer_contact: 'Pat, 555-0100',
};

describe('ReplicatedShowsTable ASCA premium facts (MYK9-2290)', () => {
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

  it('sends each fact to its column', async () => {
    await table.set(BASE.id, BASE);
    await table.updateShow(BASE.id, FACTS);
    expect(lastPayload()).toMatchObject(FACT_COLUMNS);
  });

  it('sends null for a cleared fact', async () => {
    await table.set(BASE.id, { ...BASE, ...FACTS });
    await table.updateShow(BASE.id, {
      ascaSanctionStatus: null,
      scentsByLevel: null,
      spectatorsPolicy: null,
      photographerContact: null,
    });
    const payload = lastPayload();
    expect(payload).toHaveProperty('asca_sanction_status', null);
    expect(payload).toHaveProperty('scents_by_level', null);
    expect(payload).toHaveProperty('spectators_policy', null);
    expect(payload).toHaveProperty('photographer_contact', null);
  });

  it('leaves the facts out of an unrelated edit of a row that never held them', async () => {
    await table.set(BASE.id, BASE);
    await table.updateShow(BASE.id, { name: 'Renamed' });
    const payload = lastPayload();
    for (const column of Object.keys(FACT_COLUMNS)) expect(payload).not.toHaveProperty(column);
  });

  it('does not resend a held fact on an unrelated edit', async () => {
    await table.set(BASE.id, { ...BASE, ...FACTS });
    await table.updateShow(BASE.id, { name: 'Renamed' });
    const payload = lastPayload();
    for (const column of Object.keys(FACT_COLUMNS)) expect(payload).not.toHaveProperty(column);
  });

  it('round trips: row -> replica -> db row', () => {
    const row = {
      id: 'show-1',
      name: 'Fall Trial',
      organization: 'ASCA',
      start_date: '2026-11-07',
      end_date: '2026-11-08',
      ...FACT_COLUMNS,
    } as unknown as Database['public']['Tables']['shows']['Row'];
    const replica = rowToShow(row);
    expect(replica).toMatchObject(FACTS);
    expect(mapReplicatedShowToDbRow(replica)).toMatchObject(FACT_COLUMNS);
  });

  it('reads an unset column as absent, never as a value', () => {
    const row = {
      id: 'show-1',
      name: 'Fall Trial',
      organization: 'ASCA',
      start_date: '2026-11-07',
      end_date: '2026-11-08',
      asca_sanction_status: null,
      scents_by_level: null,
      spectators_policy: null,
      photographer_contact: null,
    } as unknown as Database['public']['Tables']['shows']['Row'];
    const replica = rowToShow(row);
    expect(replica.ascaSanctionStatus).toBeUndefined();
    expect(replica.scentsByLevel).toBeUndefined();
    expect(replica.spectatorsPolicy).toBeUndefined();
    expect(replica.photographerContact).toBeUndefined();
  });

  it('the online update mapper names only the facts an update sets', () => {
    expect(mapShowInputToUpdate({ scentsByLevel: 'Birch', photographerContact: null })).toEqual({
      scents_by_level: 'Birch',
      photographer_contact: null,
    });
    expect(mapShowInputToUpdate({ name: 'x' })).toEqual({ name: 'x' });
  });
});
