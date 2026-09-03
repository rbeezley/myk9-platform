/**
 * Phase 1h — resolveClassVisibilityForTrial resolves the visibility cascade
 * (effective preset + self-check-in) per class for offline denormalization.
 * Uses the REAL resolveCheckinCascade (@myk9/secretary) so the cascade is
 * genuinely exercised; only the Supabase fetch is mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));

import {
  resolveVisibilityForClassRows,
} from '../resolveClassVisibility';
import { supabase } from '@/services/database/supabaseClient';

/** A chainable query stub: terminal via `.maybeSingle()` or a direct await. */
function makeQuery(data: unknown) {
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    in: () => q,
    maybeSingle: () => Promise.resolve({ data, error: null }),
    then: (resolve: (v: unknown) => void) => resolve({ data, error: null }),
  };
  return q;
}

function mockTables(rows: { show?: unknown; trial?: unknown; classRows?: unknown[] }) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    switch (table) {
      case 'trials':
        return makeQuery([{ id: 'trial-1', show_id: 'show-1' }]) as never;
      case 'show_visibility_settings':
        return makeQuery(
          rows.show ? [{ show_id: 'show-1', ...(rows.show as object) }] : []
        ) as never;
      case 'trial_visibility_overrides':
        return makeQuery(
          rows.trial ? [{ trial_id: 'trial-1', ...(rows.trial as object) }] : []
        ) as never;
      case 'class_visibility_overrides':
        return makeQuery(rows.classRows ?? []) as never;
      default:
        return makeQuery(null) as never;
    }
  });
}

describe('resolveVisibilityForClassRows', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves a batch of rows, skipping rows without a trial_id', async () => {
    mockTables({ show: { preset: 'standard', self_checkin_enabled: true }, classRows: [] });
    const result = await resolveVisibilityForClassRows([
      { id: 'c1', trial_id: 'trial-1' },
      { id: 'c2', trial_id: 'trial-1' },
      { id: 'c3', trial_id: null }, // skipped
    ]);
    expect(result.get('c1')).toEqual({ visibilityPreset: 'standard', selfCheckinEnabled: true });
    expect(result.get('c2')).toEqual({ visibilityPreset: 'standard', selfCheckinEnabled: true });
    expect(result.has('c3')).toBe(false);
  });

  it('does not query when no row has a trial_id', async () => {
    const result = await resolveVisibilityForClassRows([{ id: 'c1', trial_id: null }]);
    expect(result.size).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
