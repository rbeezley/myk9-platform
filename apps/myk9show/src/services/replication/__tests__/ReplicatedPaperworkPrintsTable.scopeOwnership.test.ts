import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getScopeOwnership } from '../scopeAccountStamp';
import { ReplicatedPaperworkPrintsTable } from '../ReplicatedPaperworkPrintsTable';

/**
 * MYK9-2080: a zero-row full sync by one account over a show another account
 * saved must stamp the scope as the new account's once the server proves the
 * caller's own read empty, or print history reads "unknown" for good.
 */
const server = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  rpc: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => {
  // The keyset pager reads the rows, then a follow-up page (carrying the `or` cursor) that ends it.
  let followUp = false;
  const query = {
    select: () => query,
    eq: () => query,
    gt: () => query,
    or: () => {
      followUp = true;
      return query;
    },
    order: () => query,
    range: () => {
      const data = followUp ? [] : server.rows;
      followUp = false;
      return Promise.resolve({ data, error: null });
    },
  };
  return { supabase: { from: () => query, rpc: server.rpc } };
});
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const printRow = {
  id: 'print-a',
  show_id: 'show-1',
  trial_id: null,
  class_id: null,
  scope_kind: 'show',
  report_id: 'armband-labels',
  coverage: {},
  fingerprint: 'sha256:a',
  printed_by: 'user-a',
  printed_by_name: 'Alex',
  printed_at: '2026-07-20T14:00:00.000Z',
  voided_at: null,
  voided_by: null,
  void_reason: null,
  version: 1,
  created_at: '2026-07-20T14:00:00.000Z',
  updated_at: '2026-07-20T14:00:00.000Z',
};

describe('ReplicatedPaperworkPrintsTable scope ownership', () => {
  let table: ReplicatedPaperworkPrintsTable;
  let signedIn: string;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    server.rpc.mockReset();
    signedIn = 'user-a';
    table = new ReplicatedPaperworkPrintsTable();
    vi.spyOn(table, 'getCurrentAuthUserId').mockImplementation(async () => signedIn);

    // Account A downloads the show with one print, then B signs in on the same device.
    server.rows = [printRow];
    await table.sync('show-1');
    expect(await getScopeOwnership(table, 'show-1')).toBe('owned');
    signedIn = 'user-b';
    server.rows = [];
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it("stamps the new account when the server proves its read of the show empty over another account's row", async () => {
    server.rpc.mockResolvedValue({ data: 0, error: null });

    await table.sync('show-1');

    expect(server.rpc).toHaveBeenCalledWith('count_paperwork_prints', { p_show_id: 'show-1' });
    expect(await getScopeOwnership(table, 'show-1')).toBe('owned');
  });

  it('leaves the scope foreign when the proof is unavailable (MYK9-1133)', async () => {
    server.rpc.mockResolvedValue({ data: null, error: { code: '42501' } });

    await table.sync('show-1');

    expect(await getScopeOwnership(table, 'show-1')).toBe('foreign');
  });

  it('leaves the scope foreign when the server cannot tell (NULL: no access to the show)', async () => {
    server.rpc.mockResolvedValue({ data: null, error: null });

    await table.sync('show-1');

    expect(await getScopeOwnership(table, 'show-1')).toBe('foreign');
  });

  it('leaves the scope foreign when the caller still has rows the fetch did not return', async () => {
    server.rpc.mockResolvedValue({ data: 2, error: null });

    await table.sync('show-1');

    expect(await getScopeOwnership(table, 'show-1')).toBe('foreign');
  });
});
