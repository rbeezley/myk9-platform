import { describe, expect, it } from 'vitest';
import { deriveResultReleaseDisplay } from './resultReleaseDisplay';

describe('deriveResultReleaseDisplay (MYK9-263 / MYK9-805)', () => {
  it('withholds the placement and marks preliminary before release', () => {
    const display = deriveResultReleaseDisplay({
      resultsReleasedAt: null,
      resultStatus: 'qualified',
      finalPlacement: 1,
    });

    expect(display).toEqual({ isReleased: false, placement: undefined, isPreliminary: true });
  });

  it('shows the placement and drops "preliminary" once released', () => {
    const display = deriveResultReleaseDisplay({
      resultsReleasedAt: '2026-10-24T15:00:00Z',
      resultStatus: 'qualified',
      finalPlacement: 1,
    });

    expect(display).toEqual({ isReleased: true, placement: 1, isPreliminary: false });
  });

  it('never shows a placement for a non-qualifying result, even once released', () => {
    const display = deriveResultReleaseDisplay({
      resultsReleasedAt: '2026-10-24T15:00:00Z',
      resultStatus: 'nq',
      finalPlacement: 2,
    });

    expect(display.placement).toBeUndefined();
  });

  // 0 is the un-ranked DB default, not a placement.
  it('never shows the un-ranked 0 default as a placement', () => {
    const display = deriveResultReleaseDisplay({
      resultsReleasedAt: '2026-10-24T15:00:00Z',
      resultStatus: 'qualified',
      finalPlacement: 0,
    });

    expect(display.placement).toBeUndefined();
  });

  it('says preliminary with no placement to withhold when there is none yet', () => {
    const display = deriveResultReleaseDisplay({
      resultsReleasedAt: null,
      resultStatus: 'qualified',
      finalPlacement: null,
    });

    expect(display).toEqual({ isReleased: false, placement: undefined, isPreliminary: true });
  });
});
