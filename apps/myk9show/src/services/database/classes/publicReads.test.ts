import { beforeEach, describe, expect, it } from 'vitest';
import { createChainableQuery, mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';

import { getPublicClassById, PUBLIC_CLASS_SELECT } from './publicReads';

/** A `classes` row joined with its trial — the shape `getPublicClassById` selects. */
const classRow = {
  id: 'dec1a55e-0000-0000-0000-000000000031',
  trial_id: 'dededede-0000-0000-0000-000000000021',
  name: 'Container Novice A',
  level: 'Novice',
  element: 'Container',
  section: 'A',
  entry_fee: 30,
  status: 'completed',
  display_order: 1,
  results_released_at: '2026-08-01 09:35:00+00',
  start_time: null,
  description: 'Container Novice',
  updated_at: '2026-08-01 09:35:00+00',
  created_at: '2026-06-01 00:00:00+00',
  trial: {
    id: 'dededede-0000-0000-0000-000000000021',
    name: 'Saturday Trial',
    date: '2026-08-01',
    trial_number: 'Saturday Trial',
    status: 'upcoming',
  },
};

beforeEach(() => {
  resetMockSupabase();
});

describe('PUBLIC_CLASS_SELECT (anon-safety invariant)', () => {
  it('joins the trial but never the entries / dogs / owner / people PII chain', () => {
    expect(PUBLIC_CLASS_SELECT).toContain('trial:trials');
    // The whole point of a separate public read: a guest cannot read entry rows or PII, so the
    // select must not fan out into them (unlike postgrestGetClassById in reads.ts).
    expect(PUBLIC_CLASS_SELECT).not.toMatch(/\bentries\b/);
    expect(PUBLIC_CLASS_SELECT).not.toMatch(/\bdogs?\b/);
    expect(PUBLIC_CLASS_SELECT).not.toMatch(/\bowner\b/);
    expect(PUBLIC_CLASS_SELECT).not.toMatch(/\bpeople\b/);
  });
});

describe('getPublicClassById', () => {
  it('reads from the classes table and maps to the store class shape', async () => {
    mockSupabase.from.mockReturnValue(createChainableQuery({ data: classRow, error: null }));

    const result = await getPublicClassById(classRow.id);

    expect(mockSupabase.from).toHaveBeenCalledWith('classes');
    expect(result).not.toBeNull();
    expect(result?.id).toBe(classRow.id);
    expect(result?.trialId).toBe(classRow.trial_id);
    expect(result?.className).toBe('Container Novice A');
    expect(result?.level).toBe('Novice');
    expect(result?.element).toBe('Container');
    // The release timestamp must survive the public read — it gates results visibility.
    expect(result?.results_released_at).toBe('2026-08-01 09:35:00+00');
    // Trial join resolves the human-readable trial name (not "Unknown Trial").
    expect(result?.trial).toBe('Saturday Trial');
  });

  it('returns null when the class is absent or soft-deleted (maybeSingle → null)', async () => {
    mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: null }));

    const result = await getPublicClassById('does-not-exist');

    expect(result).toBeNull();
  });

  it('throws when the query errors (so the hook surfaces failure, not a false empty)', async () => {
    mockSupabase.from.mockReturnValue(
      createChainableQuery({ data: null, error: { message: 'boom' } })
    );

    await expect(getPublicClassById(classRow.id)).rejects.toBeTruthy();
  });
});
