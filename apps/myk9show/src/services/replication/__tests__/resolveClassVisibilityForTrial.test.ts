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
  resolveClassVisibilityForTrial,
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

function mockTables(rows: {
  show?: unknown;
  trial?: unknown;
  classRows?: unknown[];
}) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    switch (table) {
      case 'trials':
        return makeQuery({ show_id: 'show-1' }) as never;
      case 'show_visibility_settings':
        return makeQuery(rows.show ?? null) as never;
      case 'trial_visibility_overrides':
        return makeQuery(rows.trial ?? null) as never;
      case 'class_visibility_overrides':
        return makeQuery(rows.classRows ?? []) as never;
      default:
        return makeQuery(null) as never;
    }
  });
}

describe('resolveClassVisibilityForTrial', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an empty map (and skips fetching) for no classes', async () => {
    const result = await resolveClassVisibilityForTrial('trial-1', []);
    expect(result.size).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('class override wins over trial and show', async () => {
    mockTables({
      show: { preset: 'standard', self_checkin_enabled: true },
      trial: { preset: 'open', self_checkin_enabled: true },
      classRows: [{ class_id: 'c1', preset: 'review', self_checkin_enabled: false }],
    });
    const result = await resolveClassVisibilityForTrial('trial-1', ['c1']);
    expect(result.get('c1')).toEqual({ visibilityPreset: 'review', selfCheckinEnabled: false });
  });

  it('trial override applies when there is no class override', async () => {
    mockTables({
      show: { preset: 'standard', self_checkin_enabled: true },
      trial: { preset: 'open', self_checkin_enabled: false },
      classRows: [],
    });
    const result = await resolveClassVisibilityForTrial('trial-1', ['c1']);
    expect(result.get('c1')).toEqual({ visibilityPreset: 'open', selfCheckinEnabled: false });
  });

  it('falls back to the show default, then to enabled/open', async () => {
    mockTables({ show: { preset: 'standard', self_checkin_enabled: true }, classRows: [] });
    const withShow = await resolveClassVisibilityForTrial('trial-1', ['c1']);
    expect(withShow.get('c1')).toEqual({ visibilityPreset: 'standard', selfCheckinEnabled: true });

    mockTables({ classRows: [] }); // nothing configured at any level
    const bare = await resolveClassVisibilityForTrial('trial-1', ['c1']);
    expect(bare.get('c1')).toEqual({ visibilityPreset: 'open', selfCheckinEnabled: true });
  });
});

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
