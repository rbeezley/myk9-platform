/**
 * MYK9-570 round-1 review. Every catalog test injects `handler_person` by hand,
 * so the HOP that actually produces it — entry rows carrying `handler_id`, a
 * `people` read, `ReportDbEntry.handler_person` — had no coverage at all. If
 * `handler_id` stopped arriving the feature would go silently inert with every
 * other test still green.
 *
 * MYK9-664: the hop now reads the handler's NAME from `people` and the junior
 * flag, per entry, from `entry_handler_junior_flags()`. The date of birth never
 * reaches the secretary's client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReportDbEntry } from '@/lib/reports/types';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));

import { loadEntryHandlerJuniorFlags } from '@/services/database/users/juniorHandlerProfiles';
import { hydrateHandlerJuniorProfilesForTest } from '../useReportData';

const PERSON = { id: 'person-kid', first_name: 'Chris', last_name: 'Kid' };

/** A `people` read that answers with `rows`, or fails when `error` is given. */
function peopleRead(rows: unknown[], error: unknown = null) {
  const select = vi.fn().mockReturnValue({
    in: vi.fn().mockResolvedValue({ data: error ? null : rows, error }),
  });
  mocks.from.mockReturnValue({ select });
  return select;
}

/** The flag RPC: every requested entry is a junior unless `flags` says otherwise. */
function flagsRpc(flags: Record<string, boolean | null> = {}, error: unknown = null) {
  mocks.rpc.mockImplementation((_name: string, args: { p_entry_ids: string[] }) =>
    Promise.resolve(
      error
        ? { data: null, error }
        : {
            data: args.p_entry_ids.map(id => ({
              entry_id: id,
              is_junior: id in flags ? flags[id] : true,
            })),
            error: null,
          }
    )
  );
}

/**
 * A `people` read that answers each BATCH differently. The loader chunks by
 * `ID_CHUNK_SIZE` (100), so a PARTIAL read — some rows, `readComplete: false` —
 * needs more than 100 ids with one batch failing.
 */
function peopleReadPerBatch(responses: Array<{ data: unknown[] | null; error: unknown }>) {
  let call = 0;
  const inFn = vi.fn().mockImplementation(() => {
    const response = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    return Promise.resolve(response);
  });
  mocks.from.mockReturnValue({ select: vi.fn().mockReturnValue({ in: inFn }) });
  return inFn;
}

/** 150 ids: two batches under a chunk size of 100. */
function manyPersonIds(): string[] {
  return Array.from({ length: 150 }, (_, index) => `person-${index}`);
}

function entry(overrides: Partial<Record<string, unknown>> = {}): ReportDbEntry {
  return {
    id: 'e1',
    dog_id: 'd1',
    class_id: 'c1',
    trial_id: 't1',
    handler: 'Chris Kid',
    handler_id: PERSON.id,
    ...overrides,
  } as unknown as ReportDbEntry;
}

describe('loadEntryHandlerJuniorFlags', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks people for the name only — never the date of birth — and the RPC for the flag', async () => {
    const select = peopleRead([PERSON]);
    flagsRpc({ e1: true });
    const result = await loadEntryHandlerJuniorFlags([{ entryId: 'e1', handlerId: PERSON.id }]);

    const columns = (select.mock.calls[0]![0] as string).split(',').map(c => c.trim());
    expect(columns.sort()).toEqual(['first_name', 'id', 'last_name']);
    expect(mocks.from).toHaveBeenCalledWith('people');
    expect(mocks.rpc).toHaveBeenCalledWith('entry_handler_junior_flags', { p_entry_ids: ['e1'] });
    expect(result.byEntryId.get('e1')).toEqual({
      firstName: 'Chris',
      lastName: 'Kid',
      isJunior: true,
    });
    expect(result.readComplete).toBe(true);
  });

  it('does not query at all for an empty list', async () => {
    const result = await loadEntryHandlerJuniorFlags([]);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.readComplete).toBe(true);
  });

  it('reports an incomplete read rather than an empty answer', async () => {
    peopleRead([], { message: 'offline' });
    flagsRpc();
    const result = await loadEntryHandlerJuniorFlags([{ entryId: 'e1', handlerId: PERSON.id }]);
    expect(result.readComplete).toBe(false);
    expect(result.byEntryId.size).toBe(0);
  });

  it('reports an incomplete read when the flag RPC fails', async () => {
    peopleRead([PERSON]);
    flagsRpc({}, { message: 'permission denied' });
    const result = await loadEntryHandlerJuniorFlags([{ entryId: 'e1', handlerId: PERSON.id }]);
    expect(result.readComplete).toBe(false);
  });

  it('an entry the RPC does not answer for (not the caller\'s show) is "unknown", never adult', async () => {
    peopleRead([PERSON]);
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const result = await loadEntryHandlerJuniorFlags([{ entryId: 'e1', handlerId: PERSON.id }]);
    expect(result.byEntryId.get('e1')?.isJunior).toBeNull();
  });
});

describe('the report hydration hop', () => {
  beforeEach(() => vi.clearAllMocks());

  it('attaches the handler name and the flag when the entry carries a handler_id', async () => {
    peopleRead([PERSON]);
    flagsRpc({ e1: true });
    const [hydrated] = await hydrateHandlerJuniorProfilesForTest([entry()]);
    expect(hydrated?.handler_person).toEqual({
      first_name: 'Chris',
      last_name: 'Kid',
      is_junior: true,
    });
  });

  it('does not query, and attaches nothing, when no entry carries a handler_id', async () => {
    const select = peopleRead([PERSON]);
    const [hydrated] = await hydrateHandlerJuniorProfilesForTest([entry({ handler_id: null })]);
    expect(select).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(hydrated?.handler_person).toBeUndefined();
  });

  it('attaches nothing to an entry whose handler is not in the answer', async () => {
    peopleRead([PERSON]);
    flagsRpc();
    const hydrated = await hydrateHandlerJuniorProfilesForTest([
      entry(),
      entry({ id: 'e2', handler_id: 'person-absent' }),
    ]);
    expect(hydrated[0]?.handler_person).toBeDefined();
    expect(hydrated[1]?.handler_person).toBeUndefined();
  });

  it('marks NOBODY when only SOME batches answered', async () => {
    // Half a hydration would mark some juniors and silently miss others, with
    // nothing on the page to say which — so it marks none.
    const ids = manyPersonIds();
    const firstBatchRows = ids.slice(0, 100).map(id => ({ ...PERSON, id }));
    const inFn = peopleReadPerBatch([
      { data: firstBatchRows, error: null },
      { data: null, error: { message: 'offline' } },
    ]);
    flagsRpc();

    const entries = ids.map(id => entry({ id: `e-${id}`, handler_id: id }));
    const hydrated = await hydrateHandlerJuniorProfilesForTest(entries);

    expect(inFn, 'the fixture must really produce two batches').toHaveBeenCalledTimes(2);
    expect(hydrated[0]?.handler_person).toBeUndefined();
    expect(hydrated.every(e => e.handler_person === undefined)).toBe(true);
  });

  it('marks everyone when every batch answered', async () => {
    // Positive control for the test above: same two-batch shape, no failure.
    const ids = manyPersonIds();
    const inFn = peopleReadPerBatch([
      { data: ids.slice(0, 100).map(id => ({ ...PERSON, id })), error: null },
      { data: ids.slice(100).map(id => ({ ...PERSON, id })), error: null },
    ]);
    flagsRpc();

    const entries = ids.map(id => entry({ id: `e-${id}`, handler_id: id }));
    const hydrated = await hydrateHandlerJuniorProfilesForTest(entries);

    expect(inFn).toHaveBeenCalledTimes(2);
    expect(hydrated.every(e => e.handler_person?.is_junior === true)).toBe(true);
  });

  it('marks NOBODY when the people read did not complete', async () => {
    peopleRead([], { message: 'offline' });
    flagsRpc();
    const [hydrated] = await hydrateHandlerJuniorProfilesForTest([entry()]);
    expect(hydrated?.handler_person).toBeUndefined();
  });
});
