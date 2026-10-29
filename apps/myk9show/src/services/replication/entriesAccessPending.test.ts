/**
 * MYK9-1476: a role-set change marks each held and in-flight show pending; the
 * next sync of a pending show replaces its clean rows after the download, and
 * clears the mark only when that replace completed and began after the mark.
 * Runs against a real IndexedDB replica; only the network is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRoleWithDetails } from '@/types/rbac-types';
import { supabase } from '@/services/database/supabaseClient';
import { TEST_ACCOUNT_ID } from '@/test/setup';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';
import { activeRoleSetSignature, noteEntriesAccessRoles } from './entriesAccessPending';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const KEY = (userId: string) => `myk9:entries:access-pending:v1:${userId}`;

function role(name: string, clubId: string | null, showId: string | null) {
  return {
    id: `${name}-${clubId}-${showId}`,
    role_id: name,
    club_id: clubId,
    show_id: showId,
    expires_at: null,
    is_active: true,
    role: { name },
  } as unknown as UserRoleWithDetails;
}

const secretary = role('secretary', 'club-1', null);
const steward = role('steward', null, 'show-1');
const OLD_SIGNATURE = activeRoleSetSignature([secretary]);

const entry = (id: string, showId: string, resultStatus = 'pending') =>
  ({
    id,
    showId,
    classId: 'class-1',
    dogId: `dog-${id}`,
    armband: id,
    entryStatus: 'confirmed',
    resultStatus,
  }) as ReplicatedEntry;

const serverRow = (id: string, showId: string, resultStatus = 'qualified') => ({
  id,
  show_id: showId,
  class_id: 'class-1',
  dog_id: `dog-${id}`,
  armband: id,
  entry_status: 'confirmed',
  result_status: resultStatus,
  version: 7,
  updated_at: '2026-10-28T12:00:30.000+00:00',
});

type Answer = { rows: Record<string, unknown>[]; error?: boolean; gate?: Promise<void> };
/** What the view answers per show; a missing show answers zero rows. */
let answers: Record<string, Answer> = {};

function mockView() {
  vi.mocked(supabase.from).mockImplementation((() => {
    let showId = '';
    const chain: Record<string, unknown> = {};
    for (const step of ['select', 'gt', 'or', 'order', 'range', 'in']) chain[step] = () => chain;
    chain.eq = (_col: string, value: string) => {
      showId = value;
      return chain;
    };
    chain.then = async (resolve: (value: unknown) => unknown) => {
      const answer = answers[showId] ?? { rows: [] };
      await answer.gate;
      return resolve({
        data: answer.error ? null : answer.rows,
        error: answer.error ? { message: 'offline' } : null,
        count: answer.rows.length,
      });
    };
    return chain;
  }) as never);
}

const pending = (userId = TEST_ACCOUNT_ID) => {
  const raw = localStorage.getItem(KEY(userId));
  return raw
    ? (JSON.parse(raw) as {
        showIds: string[];
        markedAt: number;
        signature: string;
        shrank: boolean;
      })
    : null;
};

describe('activeRoleSetSignature (MYK9-1476)', () => {
  it('ignores order, inactive roles and expired roles', () => {
    const inactive = { ...steward, is_active: false } as UserRoleWithDetails;
    const expired = { ...steward, expires_at: '2020-01-01T00:00:00Z' } as UserRoleWithDetails;
    const base = activeRoleSetSignature([secretary, steward]);

    expect(activeRoleSetSignature([steward, secretary])).toBe(base);
    expect(activeRoleSetSignature([secretary, inactive])).toBe(OLD_SIGNATURE);
    expect(activeRoleSetSignature([secretary, expired])).toBe(OLD_SIGNATURE);
    expect(base).not.toBe(OLD_SIGNATURE);
  });
});

describe('entries access pending scopes (MYK9-1476)', () => {
  let table: ReplicatedEntriesTable;
  const ids = async () => (await table.getAllOrThrow()).map(row => row.id).sort();
  const seed = (rows: ReplicatedEntry[]) => table.batchSet(rows);

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    localStorage.clear();
    answers = {};
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
    mockView();
    table = new ReplicatedEntriesTable();
    await table.clearCache();
    await seed([entry('a', 'show-1'), entry('b', 'show-1'), entry('c', 'show-2')]);
    // The cleanup cutoff is strict (rows synced BEFORE the fetch began).
    await new Promise(resolve => setTimeout(resolve, 5));
    localStorage.setItem(
      KEY(TEST_ACCOUNT_ID),
      JSON.stringify({ signature: OLD_SIGNATURE, markedAt: 0, showIds: [], shrank: false })
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('an unchanged role set touches nothing', async () => {
    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary], table);

    expect(pending()).toEqual({
      signature: OLD_SIGNATURE,
      markedAt: 0,
      showIds: [],
      shrank: false,
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('no stored signature (first load after deploy) marks every held show', async () => {
    localStorage.clear();
    answers = {
      'show-1': { rows: [serverRow('a', 'show-1'), serverRow('b', 'show-1')] },
      'show-2': { rows: [serverRow('c', 'show-2')] },
    };

    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary], table);

    // Marked, refetched in full and cleared in one pass.
    expect(pending()).toMatchObject({ signature: OLD_SIGNATURE, showIds: [] });
    expect((await table.get('a'))?.resultStatus).toBe('qualified');
    expect((await table.get('c'))?.resultStatus).toBe('qualified');
  });

  it('marks held AND in-flight shows, and the next sync lands the newly unmasked rows', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    // show-3 holds no rows yet; its sync is mid-fetch under the old roles.
    answers = {
      'show-3': { rows: [], gate },
      'show-1': { rows: [serverRow('a', 'show-1'), serverRow('b', 'show-1')], gate },
      'show-2': { rows: [serverRow('c', 'show-2')], gate },
    };
    const inFlight = table.sync('show-3');
    await vi.waitFor(() => expect(table.runningShowIds()).toContain('show-3'));

    const noted = noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);
    await vi.waitFor(() =>
      expect(pending()?.showIds.sort()).toEqual(['show-1', 'show-2', 'show-3'])
    );
    expect(pending()?.signature).toBe(activeRoleSetSignature([secretary, steward]));
    release();
    await Promise.all([inFlight, noted]);

    expect((await table.get('a'))?.resultStatus).toBe('qualified');
    expect(pending()?.showIds).toEqual([]);
  });

  it('revocation to zero rows evicts clean rows but keeps one with unsent work', async () => {
    await table.set('dirty', entry('dirty', 'show-1'), true, undefined, undefined, {
      allowColdInsert: 'test fixture standing in for a local write',
    });
    answers = { 'show-1': { rows: [] } };

    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [], table);

    const remaining = await ids();
    expect(remaining).toEqual(['dirty']);
    expect(pending()?.showIds).toEqual([]);
  });

  it('a failed refetch keeps the cached rows and the show pending; a later sync clears it', async () => {
    answers = {
      'show-1': { rows: [], error: true },
      'show-2': { rows: [], error: true },
    };

    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);

    expect(await ids()).toEqual(['a', 'b', 'c']);
    expect(pending()?.showIds.sort()).toEqual(['show-1', 'show-2']);

    answers = { 'show-1': { rows: [serverRow('a', 'show-1')] }, 'show-2': { rows: [] } };
    const result = await table.sync('show-1');

    expect(result.success).toBe(true);
    expect(await ids()).toEqual(['a', 'c']);
    expect(pending()?.showIds).toEqual(['show-2']);
  });

  it('a sync that started before the latest mark does not clear it', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    localStorage.setItem(
      KEY(TEST_ACCOUNT_ID),
      JSON.stringify({ signature: 'older', markedAt: Date.now(), showIds: ['show-1'] })
    );
    answers = { 'show-1': { rows: [serverRow('a', 'show-1')], gate } };
    const running = table.sync('show-1');
    await vi.waitFor(() => expect(table.runningShowIds()).toContain('show-1'));
    // A second role change re-marks while that run is fetching under the older roles.
    await new Promise(resolve => setTimeout(resolve, 5));
    const record = pending()!;
    localStorage.setItem(KEY(TEST_ACCOUNT_ID), JSON.stringify({ ...record, markedAt: Date.now() }));
    release();

    const result = await running;

    expect(result.success).toBe(true);
    expect(pending()?.showIds).toEqual(['show-1']);
  });

  it("another account's sync neither reads nor clears this account's pending set", async () => {
    localStorage.setItem(
      KEY(TEST_ACCOUNT_ID),
      JSON.stringify({ signature: 'x', markedAt: 1, showIds: ['show-1'] })
    );
    vi.spyOn(table, 'getCurrentAuthUserId').mockResolvedValue('user-b');
    answers = { 'show-1': { rows: [] } };

    await table.sync('show-1');

    expect(pending(TEST_ACCOUNT_ID)?.showIds).toEqual(['show-1']);
    expect(pending('user-b')).toBeNull();
  });

  it('a re-mark during an older run starts its own replace instead of joining it', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    localStorage.setItem(
      KEY(TEST_ACCOUNT_ID),
      JSON.stringify({ signature: 'old', markedAt: 100, showIds: ['show-1'], shrank: true })
    );
    answers = { 'show-1': { rows: [serverRow('a', 'show-1')], gate } };
    const first = table.sync('show-1');
    await vi.waitFor(() => expect(table.runningShowIds()).toContain('show-1'));
    // A second role change re-marks while the first run (M1) is still fetching.
    localStorage.setItem(
      KEY(TEST_ACCOUNT_ID),
      JSON.stringify({ signature: 'new', markedAt: 101, showIds: ['show-1'], shrank: true })
    );
    const second = table.sync('show-1');
    release();

    await Promise.all([first, second]);

    expect(pending()?.showIds).toEqual([]);
  });

  it("an account switch before the engine captures the account never clears the first account's mark", async () => {
    localStorage.setItem(
      KEY(TEST_ACCOUNT_ID),
      JSON.stringify({ signature: 'x', markedAt: 5, showIds: ['show-1'], shrank: false })
    );
    // The mark is read as the first account; everything after runs as account B.
    vi.spyOn(table, 'getCurrentAuthUserId')
      .mockResolvedValueOnce(TEST_ACCOUNT_ID)
      .mockResolvedValue('user-b');
    answers = { 'show-1': { rows: [] } };

    const result = await table.sync('show-1');

    expect(result.success).toBe(true);
    expect(pending(TEST_ACCOUNT_ID)?.showIds).toEqual(['show-1']);
  });

  it('a grant followed by a zero-row answer keeps the warm rows and still clears the show', async () => {
    answers = {};

    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary, steward], table);

    expect(await ids()).toEqual(['a', 'b', 'c']);
    expect(pending()).toMatchObject({ shrank: false, showIds: [] });
  });

  it('the first load with no stored signature and a zero-row answer keeps the warm rows', async () => {
    localStorage.clear();
    answers = {};

    await noteEntriesAccessRoles(TEST_ACCOUNT_ID, [secretary], table);

    expect(await ids()).toEqual(['a', 'b', 'c']);
    expect(pending()).toMatchObject({ shrank: false, showIds: [] });
  });

  it('a role the view does not read changes nothing', async () => {
    await noteEntriesAccessRoles(
      TEST_ACCOUNT_ID,
      [secretary, role('exhibitor', null, null)],
      table
    );

    expect(pending()).toEqual({
      signature: OLD_SIGNATURE,
      markedAt: 0,
      showIds: [],
      shrank: false,
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('a role change noted for a different signed-in account marks nothing', async () => {
    await noteEntriesAccessRoles('user-b', [secretary, steward], table);

    expect(pending('user-b')).toBeNull();
    expect(pending()?.showIds).toEqual([]);
  });
});
