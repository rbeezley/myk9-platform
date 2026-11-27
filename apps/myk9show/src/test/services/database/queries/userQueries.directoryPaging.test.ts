/**
 * MYK9-2253: the people directory loads every live person in pages and reports a
 * load that is short of the server's count.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllUsers } from '@/services/database/users';
import { mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';
import { createFakePeopleServer, makePeopleRows } from '@/test/mocks/fakePeopleServer';
import { resetShortReplicaReportsForTests } from '@/services/observability/shortReplicaAlert';

const captureMessage = vi.hoisted(() => vi.fn());
vi.mock('@sentry/react', () => ({
  withScope: (fn: (scope: unknown) => void) =>
    fn({ setLevel: vi.fn(), setTag: vi.fn(), setFingerprint: vi.fn(), setContext: vi.fn() }),
  captureMessage,
}));

describe('getAllUsers paging (MYK9-2253)', () => {
  beforeEach(() => {
    mockSupabase.rpc.mockReset();
    resetMockSupabase();
    captureMessage.mockClear();
    resetShortReplicaReportsForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves 1,200 people from a server that returns 500 rows a request', async () => {
    const server = createFakePeopleServer(makePeopleRows(1200), { maxRows: 500 });
    mockSupabase.from.mockImplementation(server.from);

    const result = await getAllUsers({ includeRoleLabels: false });

    expect(result.error).toBeNull();
    expect(result.short).toBeNull();
    expect(result.data).toHaveLength(1200);
    // Three full-or-partial pages and the empty page that ends the read.
    expect(server.rowRequests.current).toBe(4);
    // A person late in the alphabet is there, sorted last.
    expect(result.data.at(-1)).toMatchObject({ last_name: 'Last1199' });
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('loads rows that share one updated_at and a null updated_at beyond the first page', async () => {
    const rows = makePeopleRows(900);
    rows[700] = { ...rows[700], updated_at: null as unknown as string };
    const server = createFakePeopleServer(rows, { maxRows: 500 });
    mockSupabase.from.mockImplementation(server.from);

    const result = await getAllUsers({ includeRoleLabels: false });

    expect(result.data).toHaveLength(900);
    expect(result.data.map(row => row.id)).toContain(rows[700].id);
    expect(new Set(rows.map(row => row.updated_at)).size).toBe(2);
  });

  it('reports a read that is short of the server count, once, and keeps the rows it has', async () => {
    const server = createFakePeopleServer(makePeopleRows(1200), { maxRows: 500, count: 1300 });
    mockSupabase.from.mockImplementation(server.from);

    const first = await getAllUsers({ includeRoleLabels: false });
    await getAllUsers({ includeRoleLabels: false });

    expect(first.short).toEqual({
      tableName: 'people_directory',
      scope: undefined,
      serverCount: 1300,
      deviceCount: 1200,
    });
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      'Offline copy is short: people_directory holds 1200 of 1300 rows'
    );
  });

  it('fails the read when a page fails, with no partial data', async () => {
    mockSupabase.from.mockImplementation(
      createFakePeopleServer(makePeopleRows(10), { pageError: 'boom' }).from
    );

    const result = await getAllUsers({ includeRoleLabels: false });

    expect(result.data).toEqual([]);
    expect(result.error?.message).toContain('boom');
    expect(result.short).toBeNull();
  });
});
