import { beforeEach, describe, expect, it } from 'vitest';
import { createChainableQuery, mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';

import { createClass, updateClass } from './reads';
import { resetRingPhaseSchemaCache, withRingPhaseFallback } from './ringPhaseCompat';

const missing = {
  code: 'PGRST204',
  message: "Could not find the 'ring_phase' column of 'classes'",
};

describe('class writes keep the ring phase pair (MYK9-1527)', () => {
  beforeEach(() => {
    resetMockSupabase();
    resetRingPhaseSchemaCache();
  });

  it('createClass sends the pair in the body while the latch is set', async () => {
    await withRingPhaseFallback(async omit =>
      omit ? { data: [], error: null } : { data: null, error: missing }
    );
    const query = createChainableQuery({ data: { id: 'c1' }, error: null });
    mockSupabase.from.mockImplementation(() => query);

    await createClass({
      name: 'Novice A',
      ring_phase: 'break',
      ring_phase_time: '2026-10-30T10:00:00Z',
    } as never);

    expect(query.insert).toHaveBeenCalledWith([
      expect.objectContaining({ ring_phase: 'break', ring_phase_time: '2026-10-30T10:00:00Z' }),
    ]);
  });

  it('updateClass sends the pair in the body while the latch is set', async () => {
    await withRingPhaseFallback(async omit =>
      omit ? { data: [], error: null } : { data: null, error: missing }
    );
    const query = createChainableQuery({ data: { id: 'c1' }, error: null });
    mockSupabase.from.mockImplementation(() => query);

    await updateClass('c1', {
      name: 'Novice A',
      ring_phase: 'break',
      ring_phase_time: '2026-10-30T10:00:00Z',
    } as never);

    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ ring_phase: 'break', ring_phase_time: '2026-10-30T10:00:00Z' })
    );
  });
});
