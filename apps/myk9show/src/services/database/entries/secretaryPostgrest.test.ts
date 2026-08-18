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
        then: (resolve: (value: { data: unknown[] | null; error: unknown | null }) => unknown) =>
          Promise.resolve(
            resolve(
              selectedColumns.includes('refund_decision')
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

  it('preserves withdrawal timestamps when refund-decision columns are not deployed yet', async () => {
    const result = await postgrestGetSecretaryPullMetadataMap('show-1');

    expect(mocks.select).toHaveBeenNthCalledWith(
      1,
      'id, withdrawn_at, refund_decision, refund_decided_at'
    );
    expect(mocks.select).toHaveBeenNthCalledWith(2, 'id, withdrawn_at');
    expect(result.get('entry-1')).toEqual({
      id: 'entry-1',
      withdrawn_at: '2026-06-18T11:00:00Z',
      refund_decision: null,
      refund_decided_at: null,
    });
  });
});
