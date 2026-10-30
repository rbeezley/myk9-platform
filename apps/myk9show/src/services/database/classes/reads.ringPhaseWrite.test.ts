import { beforeEach, describe, expect, it } from 'vitest';
import { createChainableQuery, mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';

import { updateClass } from './reads';
import { resetRingPhaseSchemaCache } from './ringPhaseCompat';

const missing = {
  code: 'PGRST204',
  message: "Could not find the 'ring_phase' column of 'classes'",
};

let calls = 0;

describe('updateClass ring phase write body (MYK9-1527)', () => {
  beforeEach(() => {
    resetMockSupabase();
    resetRingPhaseSchemaCache();
    calls = 0;
  });

  it('retries without ring_phase / ring_phase_time in the body, not just the select', async () => {
    const queries = [
      createChainableQuery({ data: null, error: missing }),
      createChainableQuery({ data: { id: 'c1' }, error: null }),
    ];
    mockSupabase.from.mockImplementation(() => queries[Math.min(calls++, 1)]);

    const result = await updateClass('c1', {
      name: 'Novice A',
      ring_phase: 'break',
      ring_phase_time: '2026-10-30T10:00:00Z',
    } as never);

    expect(result.error).toBeNull();
    const bodies = queries.map(q => q.update.mock.calls[0]?.[0] as Record<string, unknown>);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ ring_phase: 'break' });
    expect(bodies[1]).not.toHaveProperty('ring_phase');
    expect(bodies[1]).not.toHaveProperty('ring_phase_time');
    expect(bodies[1]).toMatchObject({ name: 'Novice A' });
  });
});
