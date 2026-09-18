/**
 * MYK9-570 round-1 review. Every catalog test injects `handler_person` by hand,
 * so the HOP that actually produces it — entry rows carrying `handler_id`, a
 * `people` read, `ReportDbEntry.handler_person` — had no coverage at all. If
 * `handler_id` stopped arriving the feature would go silently inert with every
 * other test still green.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReportDbEntry } from '@/lib/reports/types';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }));

import { loadJuniorHandlerProfiles } from '@/services/database/users/juniorHandlerProfiles';
import { hydrateHandlerJuniorProfilesForTest } from '../useReportData';

const PERSON = {
  id: 'person-kid',
  first_name: 'Chris',
  last_name: 'Kid',
  date_of_birth: '2012-04-02',
  junior_handler_numbers: { AKC: 'KID-NUMBER' },
};

/** A `people` read that answers with `rows`, or fails when `error` is given. */
function peopleRead(rows: unknown[], error: unknown = null) {
  const select = vi.fn().mockReturnValue({
    in: vi.fn().mockResolvedValue({ data: error ? null : rows, error }),
  });
  mocks.from.mockReturnValue({ select });
  return select;
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

  it('asks people for exactly the columns the feature needs, and no more', () => {
    const select = peopleRead([PERSON]);
    return loadJuniorHandlerProfiles([PERSON.id]).then(result => {
      const columns = (select.mock.calls[0]![0] as string).split(',').map(c => c.trim());
      expect(columns.sort()).toEqual(
        ['date_of_birth', 'first_name', 'id', 'junior_handler_numbers', 'last_name'].sort()
      );
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
    expect(result.readComplete).toBe(true);
  });

  it('reports an incomplete read rather than an empty answer', async () => {
    peopleRead([], { message: 'offline' });
    const result = await loadJuniorHandlerProfiles([PERSON.id]);
    expect(result.readComplete).toBe(false);
    expect(result.byPersonId.size).toBe(0);
  });
});

describe('the report hydration hop', () => {
  beforeEach(() => vi.clearAllMocks());

  it('attaches the handler person when the entry carries a handler_id', async () => {
    peopleRead([PERSON]);
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
    expect(hydrated?.handler_person).toBeUndefined();
  });

  it('attaches nothing to an entry whose handler is not in the answer', async () => {
    peopleRead([PERSON]);
    const hydrated = await hydrateHandlerJuniorProfilesForTest([
      entry(),
      entry({ id: 'e2', handler_id: 'person-absent' }),
    ]);
    expect(hydrated[0]?.handler_person).toBeDefined();
    expect(hydrated[1]?.handler_person).toBeUndefined();
  });

  it('marks NOBODY when the people read did not complete', async () => {
    // Half a hydration is worse than none: the catalog would mark some juniors
    // and silently miss others, with nothing on the page to say which.
    peopleRead([], { message: 'offline' });
    const [hydrated] = await hydrateHandlerJuniorProfilesForTest([entry()]);
    expect(hydrated?.handler_person).toBeUndefined();
  });
});
