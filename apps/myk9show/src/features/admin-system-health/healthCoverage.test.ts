import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../../../supabase/functions/_shared/systemHealthChecks';
import { HEALTH_COVERAGE_SURFACES } from './healthCoverage';

describe('HEALTH_COVERAGE_SURFACES', () => {
  it('covers every snapshot check key exactly once', () => {
    const snapshotKeys = buildSnapshot({}, { now: Date.UTC(2026, 7, 17) }).checks.map(
      check => check.key
    );
    const checkKeys = HEALTH_COVERAGE_SURFACES.flatMap(surface =>
      surface.checkKey ? [surface.checkKey] : []
    );

    expect(checkKeys).toEqual(snapshotKeys);
    expect(new Set(checkKeys).size).toBe(checkKeys.length);
  });

  it('keeps the unmonitored denominator explicit', () => {
    expect(HEALTH_COVERAGE_SURFACES).toHaveLength(13);
    expect(
      HEALTH_COVERAGE_SURFACES.filter(surface => surface.verificationLevel === 'none')
    ).toHaveLength(3);
  });
});
