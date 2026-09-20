import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  getArmbandsByShow: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  createDatabaseError,
  logQuery: vi.fn(),
  supabase: { from: mocks.from },
}));
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: { getByShow: mocks.getArmbandsByShow },
}));

import { postgrestGetSecretaryPullMetadataMap } from './secretaryPostgrest';

describe('postgrestGetSecretaryPullMetadataMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockImplementation(() => {
      let selectedColumns = '';
      const query = {
        select: vi.fn((columns: string) => {
          selectedColumns = columns;
          mocks.select(columns);
          return query;
        }),
        eq: vi.fn(() => query),
        // MYK9-632: the row scope is now BOTH terminal exhibitor states.
        in: vi.fn(() => query),
        then: (resolve: (value: { data: unknown[] | null; error: unknown | null }) => unknown) =>
          Promise.resolve(
            resolve(
              selectedColumns.includes('withdrawal_reason_code')
                ? {
                    data: null,
                    error: {
                      code: '42703',
                      message: 'column entries.withdrawal_reason_code does not exist',
                    },
                  }
                : selectedColumns.includes('refund_decision')
                  ? {
                      data: null,
                      error: {
                        code: '42703',
                        message: 'column entries.refund_decision does not exist',
                      },
                    }
                  : {
                      data: [{ id: 'entry-1', withdrawn_at: '2026-06-18T11:00:00Z' }],
                      error: null,
                    }
            )
          ),
      };
      return query;
    });
  });

  // MYK9-632 added a SECOND migration-backed column group. Each must be dropped
  // on its own: folding them together would lose the refund decision on a
  // database that only lacks the reason code, and re-invite a second refund.
  it('drops each migration-backed column group independently', async () => {
    const result = await postgrestGetSecretaryPullMetadataMap('show-1');

    expect(mocks.select).toHaveBeenNthCalledWith(
      1,
      'id, withdrawn_at, refund_decision, refund_decided_at, withdrawal_reason_code'
    );
    expect(mocks.select).toHaveBeenNthCalledWith(
      2,
      'id, withdrawn_at, refund_decision, refund_decided_at'
    );
    expect(mocks.select).toHaveBeenNthCalledWith(3, 'id, withdrawn_at');
    expect(result.get('entry-1')).toEqual({
      id: 'entry-1',
      withdrawn_at: '2026-06-18T11:00:00Z',
      refund_decision: null,
      refund_decided_at: null,
      withdrawal_reason_code: null,
    });
  });
});

describe('postgrestGetSecretaryEntriesForShow — payment bookkeeping compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getArmbandsByShow.mockResolvedValue([]);
  });

  it('backfills a legacy zero from the authoritative armband replica', async () => {
    mocks.getArmbandsByShow.mockResolvedValue([
      { showId: 'show-1', dogId: 'dog-1', armbandNumber: '12A', isAvailable: false },
    ]);
    mocks.from.mockImplementation((relation: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        order: vi.fn(() =>
          Promise.resolve(
            relation === 'view_authenticated_entry_results'
              ? {
                  data: [{ id: 'entry-1', show_id: 'show-1', dog_id: 'dog-1', armband: '0' }],
                  error: null,
                }
              : { data: [], error: null }
          )
        ),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return query;
    });

    const { postgrestGetSecretaryEntriesForShow } = await import('./secretaryPostgrest');
    const result = await postgrestGetSecretaryEntriesForShow('show-1', Date.now(), 'test');

    expect(result.data[0]).toEqual(expect.objectContaining({ armband: '12A' }));
  });

  /**
   * The payment bookkeeping columns arrive with migration 20260828200000. Until it
   * is applied the view rejects them with 42703, and the whole secretary read would
   * fail -- the same shape as the 42501 that made Entry Management render
   * "Couldn't load entries". The read must degrade to the pre-migration columns.
   */
  it('retries without the payment columns when the migration is not applied', async () => {
    const reads: Array<{ relation: string; select: string }> = [];

    mocks.from.mockImplementation((relation: string) => {
      let selected = '';
      const respond = () => {
        if (relation !== 'view_authenticated_entry_results') {
          return { data: [], error: null };
        }
        if (selected.includes('payment_received_on')) {
          return {
            data: null,
            error: {
              code: '42703',
              message: 'column view_authenticated_entry_results.payment_received_on does not exist',
            },
          };
        }
        return { data: [{ id: 'entry-1' }], error: null };
      };
      const query = {
        select: vi.fn((columns: string) => {
          selected = columns;
          reads.push({ relation, select: columns });
          return query;
        }),
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        order: vi.fn(() => Promise.resolve(respond())),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(respond()).then(resolve),
      };
      return query;
    });

    const { postgrestGetSecretaryEntriesForShow } = await import('./secretaryPostgrest');
    const result = await postgrestGetSecretaryEntriesForShow('show-1', Date.now(), 'test');

    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: 'entry-1' }]);

    const viewReads = reads.filter(r => r.relation === 'view_authenticated_entry_results');
    expect(viewReads).toHaveLength(2);
    expect(viewReads[0].select).toContain('payment_received_on');
    // NOTE: `payment_reference` also appears inside the registration embed of the
    // base select, so `payment_received_on` is the only safe discriminator here.
    expect(viewReads[1].select).not.toContain('payment_received_on');
    // The retry must not also drop the scored columns the reports depend on.
    expect(viewReads[1].select).toContain('final_placement');
  });
});
