/**
 * MYK9-979 (Codex rounds 2-4 on #2707): shows.online_entries_enabled is
 * RPC-owned. Only set_show_online_entries (an online server action) writes it
 * after creation; no generic show write, local, queued or rebuilt on a stale
 * token, ever carries it. A create carries it only when known (the server
 * default, false, applies otherwise).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectDirtyRowConflict } from '@myk9/replication';
import { ReplicatedShowsTable, rowToShow, type ReplicatedShow } from '../ReplicatedShowsTable';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

type QueueMutation = (
  operation: string,
  rowId: string,
  payload: Record<string, unknown>
) => Promise<string | null>;

const BASE: ReplicatedShow = {
  id: 'show-1',
  name: 'Fall Trial',
  organization: 'AKC',
  startDate: '2026-11-07T00:00:00+00:00',
  endDate: '2026-11-08T00:00:00+00:00',
  entryOpenDate: '2026-10-01T00:00:00+00:00',
  entryCloseDate: '2026-10-24T00:00:00+00:00',
};

describe('ReplicatedShowsTable — generic show writes never carry online_entries_enabled', () => {
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

  function lastPayload(): Record<string, unknown> {
    return queueMutation.mock.calls.at(-1)?.[2] as Record<string, unknown>;
  }

  it('a name-only edit of a cached show WITHOUT the field sends no online_entries_enabled key', async () => {
    await table.set(BASE.id, BASE);
    await table.updateShow(BASE.id, { name: 'Renamed' });
    expect(lastPayload()).not.toHaveProperty('online_entries_enabled');
  });

  it('a name-only edit of a show whose value IS known never resends it', async () => {
    await table.set(BASE.id, { ...BASE, onlineEntriesEnabled: true });
    await table.updateShow(BASE.id, { name: 'Renamed' });
    expect(lastPayload()).not.toHaveProperty('online_entries_enabled');
  });

  it.each([true, false, undefined])(
    'a generic update that names the field (%s) neither sends it nor changes the local row',
    async value => {
      await table.set(BASE.id, { ...BASE, onlineEntriesEnabled: true });
      await table.updateShow(BASE.id, { name: 'Renamed', onlineEntriesEnabled: value });
      expect(lastPayload()).not.toHaveProperty('online_entries_enabled');
      expect((await table.get(BASE.id))?.onlineEntriesEnabled).toBe(true);
    }
  );

  it('a full-row payload rebuilt for a stale-token rebase never carries it', () => {
    const rebuilt = (
      table as unknown as {
        rebuildUpdatePayload: (show: ReplicatedShow) => Record<string, unknown>;
      }
    ).rebuildUpdatePayload({ ...BASE, onlineEntriesEnabled: false });
    expect(rebuilt).toHaveProperty('name', BASE.name);
    expect(rebuilt).not.toHaveProperty('online_entries_enabled');
  });

  it('a create carries a known value', async () => {
    const { id: _ignored, ...rest } = BASE;
    void _ignored;
    await table.createShow({ ...rest, onlineEntriesEnabled: true });
    expect(lastPayload()).toHaveProperty('online_entries_enabled', true);
  });

  it('a create without the field sends no key, so the server default (false) applies', async () => {
    const { id: _ignored, ...rest } = BASE;
    void _ignored;
    await table.createShow(rest);
    expect(lastPayload()).not.toHaveProperty('online_entries_enabled');
  });
});

describe('rowToShow — the server version the online-entries switch waits for (Codex round 6)', () => {
  it('carries shows.version as serverVersion, and no generic write sends it back', async () => {
    const mapped = rowToShow({
      id: 'show-1',
      name: 'Fall Trial',
      version: 12,
      online_entries_enabled: true,
    } as unknown as Parameters<typeof rowToShow>[0]);
    expect(mapped.serverVersion).toBe(12);

    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    const table = new ReplicatedShowsTable();
    const queue = vi
      .spyOn(table as unknown as { queueMutation: QueueMutation }, 'queueMutation')
      .mockResolvedValue('mutation-1');
    await table.set(BASE.id, { ...BASE, serverVersion: 12 });
    await table.updateShow(BASE.id, { name: 'Renamed' });
    const payload = queue.mock.calls.at(-1)?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('version');
    expect(payload).not.toHaveProperty('serverVersion');
    await databaseManager.reset();
  });
});

describe('ReplicatedShowsTable — a sync merge never replaces a known server value with unknown', () => {
  let table: ReplicatedShowsTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedShowsTable();
    vi.spyOn(
      table as unknown as { queueMutation: QueueMutation },
      'queueMutation'
    ).mockResolvedValue('mutation-1');
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('a dirty cached row without the field adopts the server value and keeps its own edit', async () => {
    // Cached before the column existed, then renamed offline (dirty).
    await table.set(BASE.id, BASE);
    await table.updateShow(BASE.id, { name: 'Renamed offline' });
    const local = (await table.get(BASE.id)) as ReplicatedShow;
    const remote: ReplicatedShow = { ...BASE, onlineEntriesEnabled: true };

    expect(
      detectDirtyRowConflict({ base: BASE, local, remote }).hasConflict,
      'an untouched field is not a conflict'
    ).toBe(false);

    await table.reconcileDirtyRow(BASE.id, {
      base: BASE,
      remote,
      remoteServerVersion: 2,
    });

    const merged = (await table.get(BASE.id)) as ReplicatedShow;
    expect(merged.onlineEntriesEnabled).toBe(true);
    expect(merged.name).toBe('Renamed offline');
  });
});
