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

describe('postgrestGetSecretaryPullMetadataMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Both column groups are migration-backed and applied (20260722160000,
  // 20260918041700). MYK9-654 retired the per-group retries: one read names
  // every column, and a schema error is a failure the caller handles, never a
  // quiet read that renders every pulled entry as "no saved decision".
  it('asks for every pull column in one read, with no retry', async () => {
    const schemaError = {
      code: '42703',
      message: 'column entries.withdrawal_reason_code does not exist',
    };
    mocks.from.mockImplementation(() => {
      const query = {
        select: vi.fn((columns: string) => {
          mocks.select(columns);
          return query;
        }),
        eq: vi.fn(() => query),
        // MYK9-632: the row scope is BOTH terminal exhibitor states.
        in: vi.fn(() => query),
        then: (resolve: (value: { data: unknown[] | null; error: unknown | null }) => unknown) =>
          Promise.resolve(resolve({ data: null, error: schemaError })),
      };
      return query;
    });

    await expect(postgrestGetSecretaryPullMetadataMap('show-1')).rejects.toBeTruthy();
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.select).toHaveBeenCalledWith(
      'id, withdrawn_at, refund_decision, refund_decided_at, withdrawal_reason_code'
    );
  });

  it('maps the decision and reason code onto each row', async () => {
    mocks.from.mockImplementation(() => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        then: (resolve: (value: { data: unknown[] | null; error: unknown | null }) => unknown) =>
          Promise.resolve(
            resolve({
              data: [
                {
                  id: 'entry-1',
                  withdrawn_at: '2026-06-18T11:00:00Z',
                  refund_decision: 'refund',
                  refund_decided_at: '2026-06-19T11:00:00Z',
                  withdrawal_reason_code: 'in_season',
                },
              ],
              error: null,
            })
          ),
      };
      return query;
    });

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

describe('postgrestGetSecretaryEntriesForShow — payment bookkeeping compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * The payment bookkeeping columns (20260828200000) are applied. MYK9-654
   * retired the pre-migration retry: the one read names them, and a schema
   * error surfaces instead of quietly dropping the secretary's bookkeeping.
   */
  it('selects the payment columns once, with no retry', async () => {
    const reads: Array<{ relation: string; select: string }> = [];

    mocks.from.mockImplementation((relation: string) => {
      const respond = () =>
        relation === 'view_authenticated_entry_results'
          ? {
              data: null,
              error: {
                code: '42703',
                message:
                  'column view_authenticated_entry_results.payment_received_on does not exist',
              },
            }
          : { data: [], error: null };
      const query = {
        select: vi.fn((columns: string) => {
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

    await expect(
      postgrestGetSecretaryEntriesForShow('show-1', Date.now(), 'test')
    ).rejects.toBeTruthy();

    const viewReads = reads.filter(r => r.relation === 'view_authenticated_entry_results');
    expect(viewReads).toHaveLength(1);
    // `payment_reference` also appears inside the registration embed of the
    // base select, so `payment_received_on` is the only safe discriminator here.
    expect(viewReads[0].select).toContain('payment_received_on');
    expect(viewReads[0].select).toContain('payment_notes');
  });

  it('projects the canonical handler identity from joined handler and owner rows', async () => {
    mocks.from.mockImplementation((relation: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        order: vi.fn(() =>
          Promise.resolve(
            relation === 'view_authenticated_entry_results'
              ? {
                  data: [
                    {
                      id: 'entry-owner-handler',
                      handler: null,
                      handler_id: null,
                      dog: {
                        owner: {
                          id: 'owner-1',
                          first_name: 'Olivia',
                          last_name: 'Owner',
                        },
                      },
                    },
                  ],
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

    const result = await postgrestGetSecretaryEntriesForShow('show-1', Date.now(), 'test');

    expect(result.data[0]).toMatchObject({
      handler_identity: {
        name: 'Olivia Owner',
        source: 'owner',
      },
    });
  });
});
