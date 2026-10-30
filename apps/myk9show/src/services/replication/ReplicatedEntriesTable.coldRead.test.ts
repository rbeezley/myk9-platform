import { beforeEach, describe, expect, it, vi } from 'vitest';

const select = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: (columns: string) => {
        select(columns);
        return { eq: () => ({ maybeSingle: () => results.shift() }) };
      },
    }),
  },
}));

let results: Array<Promise<{ data: unknown; error: unknown }>> = [];

import { readColdEntryRow } from './ReplicatedEntriesTable.coldRead';

describe('readColdEntryRow (MYK9-1527)', () => {
  beforeEach(() => {
    select.mockReset();
  });

  it('retries without the tie pair when the view lacks it', async () => {
    results = [
      Promise.resolve({
        data: null,
        error: { code: '42703', message: 'column placement_tie does not exist' },
      }),
      Promise.resolve({ data: { id: 'e1' }, error: null }),
    ];
    const result = await readColdEntryRow('e1');
    expect(result.data).toEqual({ id: 'e1' });
    expect(select.mock.calls[0]?.[0]).toContain('placement_tiebreak');
    expect(select.mock.calls[1]?.[0]).not.toContain('placement_tie');
    expect(select.mock.calls[1]?.[0]).toContain('registration_confirmation_number');
  });

  it('does not retry an unrelated failure', async () => {
    results = [Promise.resolve({ data: null, error: { code: '42501', message: 'denied' } })];
    const result = await readColdEntryRow('e1');
    expect(select).toHaveBeenCalledTimes(1);
    expect(result.error).toBeTruthy();
  });
});
