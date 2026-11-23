import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  createDatabaseError,
  logQuery: vi.fn(),
  supabase: { from: mocks.from },
}));

import {
  postgrestGetSecretaryEntriesForShow,
  postgrestGetSecretaryPullMetadataMap,
} from './secretaryPostgrest';

/**
 * A fake `entries` read that pages like PostgREST: `max_rows` 1000 per response, keyset on id
 * (descending, `lt` the last id). `fail` answers that page number with an error.
 */
function fakeMetadataRead(rows: Array<Record<string, unknown>>, fail?: { page: number }) {
  const calls = { select: [] as string[], in: [] as unknown[], pages: 0 };
  mocks.from.mockImplementation(() => {
    let cursor: string | null = null;
    const query = {
      select: vi.fn((columns: string) => {
        calls.select.push(columns);
        return query;
      }),
      eq: vi.fn(() => query),
      in: vi.fn((column: string, values: string[]) => {
        calls.in.push([column, values]);
        return query;
      }),
      order: vi.fn(() => query),
      lt: vi.fn((_column: string, value: string) => {
        cursor = value;
        return query;
      }),
      range: vi.fn((from: number, to: number) => {
        calls.pages += 1;
        if (fail && calls.pages === fail.page) {
          return Promise.resolve({ data: null, error: { message: 'network' } });
        }
        const sorted = [...rows].sort((a, b) => String(b.id).localeCompare(String(a.id)));
        const after = cursor === null ? sorted : sorted.filter(row => String(row.id) < cursor!);
        return Promise.resolve({ data: after.slice(from, to + 1), error: null });
      }),
    };
    return query;
  });
  return calls;
}

const metadataRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  withdrawn_at: null,
  refund_decision: null,
  refund_decided_at: null,
  withdrawal_reason_code: null,
  ...over,
});

describe('postgrestGetSecretaryPullMetadataMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Both column groups are migration-backed and applied (20260722160000,
  // 20260918041700). MYK9-654 retired the per-group retries: one read names
  // every column, and a schema error is a failure the caller handles, never a
  // quiet read that renders every pulled entry as "no saved decision".
  it('asks for every pull column, and a failed read throws', async () => {
    const calls = fakeMetadataRead([], { page: 1 });

    await expect(postgrestGetSecretaryPullMetadataMap('show-1')).rejects.toBeTruthy();
    expect(calls.select).toEqual([
      'id, withdrawn_at, refund_decision, refund_decided_at, withdrawal_reason_code',
    ]);
  });

  // MYK9-2099: a no-show can carry a refund decision, so 'absent' is read with the removals.
  // Without it a denied no-show reads as undecided and stays "to decide" for good.
  it('reads the decision for pulls, withdrawals, removals and no-shows', async () => {
    const calls = fakeMetadataRead([]);

    await postgrestGetSecretaryPullMetadataMap('show-1');

    expect(calls.in).toEqual([['entry_status', ['scratched', 'withdrawn', 'absent']]]);
  });

  // MYK9-2099: PostgREST caps one response at 1000 rows. A truncated read would show every
  // denied refund past row 1000 as undecided.
  it('reads every page past 1000 rows', async () => {
    const rows = Array.from({ length: 2345 }, (_, index) =>
      metadataRow(`entry-${String(index).padStart(5, '0')}`, { refund_decision: 'denied' })
    );
    const calls = fakeMetadataRead(rows);

    const result = await postgrestGetSecretaryPullMetadataMap('show-1');

    expect(calls.pages).toBe(3);
    expect(result.size).toBe(2345);
    expect(result.get('entry-00000')?.refund_decision).toBe('denied');
    expect(result.get('entry-02344')?.refund_decision).toBe('denied');
  });

  it('throws when a later page fails, so decisions read as unknown, never as a partial map', async () => {
    const rows = Array.from({ length: 1500 }, (_, index) =>
      metadataRow(`entry-${String(index).padStart(5, '0')}`)
    );
    fakeMetadataRead(rows, { page: 2 });

    await expect(postgrestGetSecretaryPullMetadataMap('show-1')).rejects.toBeTruthy();
  });

  it('maps the decision and reason code onto each row', async () => {
    fakeMetadataRead([
      metadataRow('entry-1', {
        withdrawn_at: '2026-06-18T11:00:00Z',
        refund_decision: 'refund',
        refund_decided_at: '2026-06-19T11:00:00Z',
        withdrawal_reason_code: 'in_season',
      }),
    ]);

    const result = await postgrestGetSecretaryPullMetadataMap('show-1');

    expect(result.get('entry-1')).toEqual({
      id: 'entry-1',
      withdrawn_at: '2026-06-18T11:00:00Z',
      refund_decision: 'refund',
      refund_decided_at: '2026-06-19T11:00:00Z',
      withdrawal_reason_code: 'in_season',
    });
  });
});

type ViewAnswer = { data: Array<Record<string, unknown>> | null; error: unknown };

/**
 * A fake of the three relations the cold-store read touches, paging like PostgREST (1000 rows per
 * response, keyset on id descending). `view` answers each read of the entry-results view from its
 * select list; `metadata` answers the saved-decision read of `entries`; `held` the held lookup.
 */
function fakeSecretaryDb(config: {
  view: (columns: string) => ViewAnswer;
  metadata?: ViewAnswer;
  held?: string[];
}) {
  const viewSelects: string[] = [];
  mocks.from.mockImplementation((relation: string) => {
    let columns = '';
    let cursor: string | null = null;
    let kind: 'view' | 'held' | 'metadata' = relation === 'entries' ? 'metadata' : 'view';
    const query = {
      select: vi.fn((selected: string) => {
        columns = selected;
        if (relation === 'view_authenticated_entry_results') viewSelects.push(selected);
        return query;
      }),
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      in: vi.fn(() => query),
      filter: vi.fn(() => {
        kind = 'held';
        return query;
      }),
      order: vi.fn(() => query),
      lt: vi.fn((_column: string, value: string) => {
        cursor = value;
        return query;
      }),
      range: vi.fn((from: number, to: number) => {
        const answer: ViewAnswer =
          kind === 'held'
            ? { data: (config.held ?? []).map(id => ({ id })), error: null }
            : kind === 'metadata'
              ? (config.metadata ?? { data: [], error: null })
              : config.view(columns);
        if (answer.error || !answer.data) return Promise.resolve(answer);
        const sorted = [...answer.data].sort((a, b) => String(b.id).localeCompare(String(a.id)));
        const after = cursor === null ? sorted : sorted.filter(row => String(row.id) < cursor!);
        return Promise.resolve({ data: after.slice(from, to + 1), error: null });
      }),
    };
    return query;
  });
  return { viewSelects };
}

const columnsOf = (select: string) => select.split(/[\s,]+/);

describe('postgrestGetSecretaryEntriesForShow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * The payment bookkeeping columns (20260828200000) are applied. MYK9-654
   * retired the pre-migration retry: the one read names them, and a schema
   * error surfaces instead of quietly dropping the secretary's bookkeeping.
   */
  it('selects the payment columns once, with no retry', async () => {
    const { viewSelects } = fakeSecretaryDb({
      view: () => ({
        data: null,
        error: {
          code: '42703',
          message: 'column view_authenticated_entry_results.payment_received_on does not exist',
        },
      }),
    });

    await expect(
      postgrestGetSecretaryEntriesForShow('show-1', Date.now(), 'test')
    ).rejects.toBeTruthy();

    // `payment_reference` also appears inside the registration embed of the
    // base select, so `payment_received_on` is the only safe discriminator here.
    expect(viewSelects.filter(select => select.includes('payment_received_on'))).toHaveLength(1);
    expect(columnsOf(viewSelects[0])).toEqual(expect.arrayContaining(['payment_notes']));
  });

  // MYK9-2099: a failed decision read is "unknown", never "nothing decided": an empty answer would
  // put every denied refund back on the list as one to decide.
  it('marks every entry as decisions-unknown when the saved-decision read fails', async () => {
    fakeSecretaryDb({
      view: () => ({ data: [{ id: 'entry-1' }], error: null }),
      metadata: { data: null, error: { message: 'network' } },
    });

    const { data } = await postgrestGetSecretaryEntriesForShow('show-1', Date.now(), 'test');

    expect(data[0]).toMatchObject({ refund_decision_unknown: true });
  });

  // The old single select stopped at PostgREST's max_rows (1000), silently dropping the rest.
  it('reads every page of a show past 1000 entries and presents them oldest first', async () => {
    const rows = Array.from({ length: 2500 }, (_, index) => ({
      id: `entry-${String(index).padStart(5, '0')}`,
      show_id: 'show-1',
      // Created in reverse id order, so id order and presentation order differ.
      created_at: `2026-06-01T00:${String(59 - (index % 60)).padStart(2, '0')}:00Z`,
    }));
    fakeSecretaryDb({ view: () => ({ data: rows, error: null }) });

    const { data } = await postgrestGetSecretaryEntriesForShow('show-1', Date.now(), 'test');

    expect(data).toHaveLength(2500);
    expect(new Set(data.map(entry => entry.id)).size).toBe(2500);
    const stamps = data.map(entry => entry.created_at as string);
    expect([...stamps].sort()).toEqual(stamps);
  });

  it('throws when a later page fails, never returning a truncated roster', async () => {
    const rows = Array.from({ length: 1500 }, (_, index) => ({
      id: `entry-${String(index).padStart(5, '0')}`,
    }));
    let reads = 0;
    fakeSecretaryDb({
      view: () => {
        reads += 1;
        return reads === 1
          ? { data: rows, error: null }
          : { data: null, error: { message: 'network' } };
      },
    });

    await expect(
      postgrestGetSecretaryEntriesForShow('show-1', Date.now(), 'test')
    ).rejects.toBeTruthy();
  });

  // MYK9-1473: Results derives "Record coin flip" from the tie state. A fallback
  // that omits it reads every tie as resolved, offers Check scores, and the
  // server refuses the check (MK018) with no way forward from the tab.
  it('reads the tie state and points the Results tab needs', async () => {
    const { viewSelects } = fakeSecretaryDb({
      view: () => ({
        data: [{ id: 'entry-1', placement_tie: 'unresolved', placement_tiebreak: null }],
        error: null,
      }),
    });

    const { data } = await postgrestGetSecretaryEntriesForShow('show-1', Date.now(), 'test');

    expect(columnsOf(viewSelects[0])).toEqual(
      expect.arrayContaining(['placement_tie', 'placement_tiebreak', 'points_earned'])
    );
    expect(data[0]).toMatchObject({ placement_tie: 'unresolved' });
  });

  // The frontend can ship before 20261029043900 is pushed. PostgREST names one
  // unknown column per failure, so each optional set is dropped as it is named.
  function viewRejecting(missing: string[]) {
    return fakeSecretaryDb({
      view: columns => {
        const absent = missing.find(column => columnsOf(columns).includes(column));
        return absent
          ? {
              data: null,
              error: {
                code: '42703',
                message: `column view_authenticated_entry_results.${absent} does not exist`,
              },
            }
          : { data: [{ id: 'entry-1' }], error: null };
      },
    }).viewSelects;
  }

  it('drops the tie columns and keeps the move-up link when only the tie migration is missing', async () => {
    const selects = viewRejecting(['placement_tie']);

    const { data } = await postgrestGetSecretaryEntriesForShow('show-1', Date.now(), 'test');

    expect(data).toHaveLength(1);
    const reads = selects.map(columnsOf);
    expect(reads).toHaveLength(2);
    expect(reads[1]).not.toContain('placement_tie');
    expect(reads[1]).not.toContain('placement_tiebreak');
    expect(reads[1]).toContain('moved_from_entry_id');
  });

  it('drops each optional set in turn when both migrations are missing', async () => {
    const selects = viewRejecting(['placement_tie', 'moved_from_entry_id']);

    const { data } = await postgrestGetSecretaryEntriesForShow('show-1', Date.now(), 'test');

    expect(data).toHaveLength(1);
    const reads = selects.map(columnsOf);
    expect(reads.length).toBeGreaterThanOrEqual(3);
    expect(reads[reads.length - 1]).not.toContain('placement_tie');
    expect(reads[reads.length - 1]).not.toContain('moved_from_entry_id');
  });

  it('projects the canonical handler identity from joined handler and owner rows', async () => {
    fakeSecretaryDb({
      view: () => ({
        data: [
          {
            id: 'entry-owner-handler',
            handler: null,
            handler_id: null,
            dog: { owner: { id: 'owner-1', first_name: 'Olivia', last_name: 'Owner' } },
          },
        ],
        error: null,
      }),
    });

    const result = await postgrestGetSecretaryEntriesForShow('show-1', Date.now(), 'test');

    expect(result.data[0]).toMatchObject({
      handler_identity: { name: 'Olivia Owner', source: 'owner' },
    });
  });

  it("stamps the server's held verdict on the rows it reads (MYK9-1162)", async () => {
    fakeSecretaryDb({
      view: () => ({
        data: [
          { id: 'entry-ok', show_id: 'show-1' },
          { id: 'entry-held', show_id: 'show-1' },
        ],
        error: null,
      }),
      held: ['entry-held'],
    });

    const result = await postgrestGetSecretaryEntriesForShow('show-1', Date.now(), 'test');

    expect(
      result.data.map(entry => [entry.id, entry.awaiting_registration_number === true])
    ).toEqual([
      ['entry-held', true],
      ['entry-ok', false],
    ]);
  });

  it('copies the withdrawal reason code from the pull metadata onto the merged row (MYK9-1410)', async () => {
    fakeSecretaryDb({
      view: () => ({ data: [{ id: 'entry-withdrawn', show_id: 'show-1' }], error: null }),
      metadata: {
        data: [
          {
            id: 'entry-withdrawn',
            withdrawn_at: '2026-06-18T11:00:00Z',
            refund_decision: null,
            refund_decided_at: null,
            withdrawal_reason_code: 'in_season',
          },
        ],
        error: null,
      },
    });

    const result = await postgrestGetSecretaryEntriesForShow('show-1', Date.now(), 'test');

    expect(result.data[0]).toMatchObject({
      id: 'entry-withdrawn',
      withdrawn_at: '2026-06-18T11:00:00Z',
      withdrawal_reason_code: 'in_season',
    });
  });
});
