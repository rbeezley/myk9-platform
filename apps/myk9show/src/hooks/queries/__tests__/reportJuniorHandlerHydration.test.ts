/**
 * MYK9-570 round-1 review. Every catalog test injects `handler_person` by hand,
 * so the HOP that actually produces it — entry rows carrying `handler_id`, a
 * public-name read plus private-profile RPC, `ReportDbEntry.handler_person` — had no coverage at all. If
 * `handler_id` stopped arriving the feature would go silently inert with every
 * other test still green.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReportDbEntry } from '@/lib/reports/types';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));

import { loadJuniorHandlerProfiles } from '@/services/database/users/juniorHandlerProfiles';
import { hydrateHandlerJuniorProfilesForTest } from '../useReportData';

const PERSON = {
  id: 'person-kid',
  first_name: 'Chris',
  last_name: 'Kid',
  date_of_birth: '2012-04-02',
  junior_handler_numbers: { AKC: 'KID-NUMBER' },
};

/** A public `people` name read that answers with `rows`, or fails when `error` is given. */
function peopleRead(rows: unknown[], error: unknown = null) {
  const select = vi.fn().mockReturnValue({
    in: vi.fn().mockResolvedValue({ data: error ? null : rows, error }),
  });
  mocks.from.mockReturnValue({ select });
  return select;
}

function privateRead(rows: unknown[], error: unknown = null) {
  mocks.rpc.mockResolvedValue({ data: error ? null : rows, error });
}

/**
 * A `people` read that answers each BATCH differently.
 *
 * `loadJuniorHandlerProfiles` chunks its id list by `ID_CHUNK_SIZE` (100), so
 * the only way to reach a PARTIAL read — some rows, `readComplete: false` — is
 * more than 100 ids with one batch failing. Round 2 showed the previous test
 * never reached that state: it failed the read outright, so `byPersonId.size`
 * was 0 and the second half of the `||` returned first. The guard's own
 * mutation survived.
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

function privateReadPerBatch(responses: Array<{ data: unknown[] | null; error: unknown }>) {
  let call = 0;
  const rpc = vi.fn().mockImplementation(() => {
    const response = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    return Promise.resolve(response);
  });
  mocks.rpc.mockImplementation(rpc);
  return rpc;
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

describe('loadJuniorHandlerProfiles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks people only for names and uses the private RPC for sensitive fields', () => {
    const select = peopleRead([PERSON]);
    privateRead([
      {
        person_id: PERSON.id,
        date_of_birth: PERSON.date_of_birth,
        junior_handler_numbers: PERSON.junior_handler_numbers,
      },
    ]);
    return loadJuniorHandlerProfiles([PERSON.id]).then(result => {
      const columns = (select.mock.calls[0]![0] as string).split(',').map(c => c.trim());
      expect(columns.sort()).toEqual(['first_name', 'id', 'last_name'].sort());
      expect(mocks.rpc).toHaveBeenCalledWith('get_people_private', { p_person_ids: [PERSON.id] });
      expect(result.byPersonId.get(PERSON.id)).toEqual({
        firstName: 'Chris',
        lastName: 'Kid',
        dateOfBirth: '2012-04-02',
        juniorHandlerNumbers: { AKC: 'KID-NUMBER' },
      });
      expect(result.readComplete).toBe(true);
    });
  });

  it('does not query at all for an empty id list', async () => {
    peopleRead([]);
    const result = await loadJuniorHandlerProfiles([]);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.readComplete).toBe(true);
  });

  it('reports an incomplete read rather than an empty answer', async () => {
    peopleRead([PERSON]);
    privateRead([], { message: 'offline' });
    const result = await loadJuniorHandlerProfiles([PERSON.id]);
    expect(result.readComplete).toBe(false);
    expect(result.byPersonId.size).toBe(0);
  });

  it('does not treat an empty successful private response as complete', async () => {
    peopleRead([PERSON]);
    privateRead([]);
    const result = await loadJuniorHandlerProfiles([PERSON.id]);
    expect(result.readComplete).toBe(false);
    expect(result.byPersonId.size).toBe(0);
  });

  it('treats an authorized empty private profile as complete', async () => {
    peopleRead([PERSON]);
    privateRead([
      {
        person_id: PERSON.id,
        date_of_birth: null,
        junior_handler_numbers: {},
      },
    ]);
    const result = await loadJuniorHandlerProfiles([PERSON.id]);
    expect(result.readComplete).toBe(true);
    expect(result.byPersonId.get(PERSON.id)).toEqual({
      firstName: 'Chris',
      lastName: 'Kid',
      dateOfBirth: null,
      juniorHandlerNumbers: undefined,
    });
  });
});

describe('the report hydration hop', () => {
  beforeEach(() => vi.clearAllMocks());

  it('attaches the handler person when the entry carries a handler_id', async () => {
    peopleRead([PERSON]);
    privateRead([
      {
        person_id: PERSON.id,
        date_of_birth: PERSON.date_of_birth,
        junior_handler_numbers: PERSON.junior_handler_numbers,
      },
    ]);
    const [hydrated] = await hydrateHandlerJuniorProfilesForTest([entry()]);
    expect(hydrated?.handler_person).toEqual({
      first_name: 'Chris',
      last_name: 'Kid',
      date_of_birth: '2012-04-02',
      junior_handler_numbers: { AKC: 'KID-NUMBER' },
    });
  });

  it('does not query, and attaches nothing, when no entry carries a handler_id', async () => {
    const select = peopleRead([PERSON]);
    const [hydrated] = await hydrateHandlerJuniorProfilesForTest([entry({ handler_id: null })]);
    expect(select).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(hydrated?.handler_person).toBeUndefined();
  });

  it('attaches nothing when the private answer is incomplete', async () => {
    peopleRead([PERSON]);
    privateRead([
      {
        person_id: PERSON.id,
        date_of_birth: PERSON.date_of_birth,
        junior_handler_numbers: PERSON.junior_handler_numbers,
      },
    ]);
    const hydrated = await hydrateHandlerJuniorProfilesForTest([
      entry(),
      entry({ id: 'e2', handler_id: 'person-absent' }),
    ]);
    expect(hydrated[0]?.handler_person).toBeUndefined();
    expect(hydrated[1]?.handler_person).toBeUndefined();
  });

  it('marks NOBODY when only SOME batches answered', async () => {
    // The state the guard actually exists for, and the one round 2 found
    // untested: batch 1 returns rows, batch 2 errors. Half a hydration would
    // mark some juniors and silently miss others, with nothing on the page to
    // say which — so it marks none.
    const ids = manyPersonIds();
    const firstBatchRows = ids.slice(0, 100).map(id => ({ ...PERSON, id }));
    peopleReadPerBatch([
      { data: firstBatchRows, error: null },
      { data: null, error: { message: 'offline' } },
    ]);
    const inFn = privateReadPerBatch([
      {
        data: ids.slice(0, 100).map(id => ({ ...PERSON, person_id: id })),
        error: null,
      },
      { data: null, error: { message: 'offline' } },
    ]);

    const entries = ids.map(id => entry({ id: `e-${id}`, handler_id: id }));
    const hydrated = await hydrateHandlerJuniorProfilesForTest(entries);

    expect(inFn, 'the fixture must really produce two batches').toHaveBeenCalledTimes(2);
    // The first batch DID answer for this person — the guard is what suppresses it.
    expect(hydrated[0]?.handler_person).toBeUndefined();
    expect(hydrated.every(e => e.handler_person === undefined)).toBe(true);
  });

  it('marks everyone when every batch answered', async () => {
    // Positive control for the test above: same two-batch shape, no failure.
    const ids = manyPersonIds();
    peopleReadPerBatch([
      { data: ids.slice(0, 100).map(id => ({ ...PERSON, id })), error: null },
      { data: ids.slice(100).map(id => ({ ...PERSON, id })), error: null },
    ]);
    const inFn = privateReadPerBatch([
      {
        data: ids.slice(0, 100).map(id => ({ ...PERSON, person_id: id })),
        error: null,
      },
      {
        data: ids.slice(100).map(id => ({ ...PERSON, person_id: id })),
        error: null,
      },
    ]);

    const entries = ids.map(id => entry({ id: `e-${id}`, handler_id: id }));
    const hydrated = await hydrateHandlerJuniorProfilesForTest(entries);

    expect(inFn).toHaveBeenCalledTimes(2);
    expect(hydrated.every(e => e.handler_person !== undefined)).toBe(true);
  });

  it('marks NOBODY when the people read did not complete', async () => {
    // Half a hydration is worse than none: the catalog would mark some juniors
    // and silently miss others, with nothing on the page to say which.
    peopleRead([PERSON]);
    privateRead([], { message: 'offline' });
    const [hydrated] = await hydrateHandlerJuniorProfilesForTest([entry()]);
    expect(hydrated?.handler_person).toBeUndefined();
  });
});
