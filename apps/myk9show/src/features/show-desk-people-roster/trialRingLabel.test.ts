import { describe, expect, it } from 'vitest';
import { buildTrialRingResolver } from './trialRingLabel';

/**
 * MYK9-842: `formatTrialIdentity` (MYK9-825) already combines a trial's name
 * and number so the ordinary same-day, same-name case stays distinguishable
 * ("Saturday A (1)" vs "Saturday A (2)"). Two trials that ALSO share a
 * number (or have none) still render an identical ring -- a genuine data
 * duplicate this resolver closes.
 */
describe('buildTrialRingResolver', () => {
  it('disambiguates two same-day trials with the literal same name AND number', () => {
    const resolve = buildTrialRingResolver([
      { trialId: 'trial-1', trialName: 'Trial 1', trialNumber: '1', trialDate: '2026-10-10' },
      { trialId: 'trial-2', trialName: 'Trial 1', trialNumber: '1', trialDate: '2026-10-10' },
    ]);

    const ring1 = resolve({
      trialId: 'trial-1',
      trialName: 'Trial 1',
      trialNumber: '1',
      trialDate: '2026-10-10',
    });
    const ring2 = resolve({
      trialId: 'trial-2',
      trialName: 'Trial 1',
      trialNumber: '1',
      trialDate: '2026-10-10',
    });

    expect(ring1).not.toBe(ring2);
    expect(ring1).toBe('Trial 1 #1');
    expect(ring2).toBe('Trial 1 #2');
  });

  it('disambiguates two same-day trials sharing a name with neither carrying a number', () => {
    const resolve = buildTrialRingResolver([
      { trialId: 'trial-1', trialName: 'AKC Trial', trialNumber: '', trialDate: '2026-10-10' },
      { trialId: 'trial-2', trialName: 'AKC Trial', trialNumber: '', trialDate: '2026-10-10' },
    ]);

    const ring1 = resolve({ trialId: 'trial-1', trialName: 'AKC Trial', trialDate: '2026-10-10' });
    const ring2 = resolve({ trialId: 'trial-2', trialName: 'AKC Trial', trialDate: '2026-10-10' });

    expect(ring1).not.toBe(ring2);
  });

  it('does not add a suffix when the numbers already disambiguate the pair', () => {
    const sources = [
      { trialId: 'trial-1', trialName: 'Saturday A', trialNumber: '1', trialDate: '2026-10-10' },
      { trialId: 'trial-2', trialName: 'Saturday A', trialNumber: '2', trialDate: '2026-10-10' },
    ];
    const resolve = buildTrialRingResolver(sources);

    expect(resolve(sources[0]!)).toBe('Saturday A (1)');
    expect(resolve(sources[1]!)).toBe('Saturday A (2)');
  });

  it('does not add a suffix for the ordinary single-trial-per-day case', () => {
    const sources = [
      { trialId: 'trial-1', trialName: 'Trial 1', trialNumber: '1', trialDate: '2026-10-10' },
    ];
    const resolve = buildTrialRingResolver(sources);

    expect(resolve(sources[0]!)).toBe('Trial 1');
  });

  it('leaves identically-named trials on DIFFERENT days untouched', () => {
    const sources = [
      { trialId: 'trial-1', trialName: 'Trial 1', trialNumber: '1', trialDate: '2026-10-10' },
      { trialId: 'trial-2', trialName: 'Trial 1', trialNumber: '1', trialDate: '2026-10-11' },
    ];
    const resolve = buildTrialRingResolver(sources);

    expect(resolve(sources[0]!)).toBe('Trial 1');
    expect(resolve(sources[1]!)).toBe('Trial 1');
  });

  it('returns null when the source has no trial identity at all', () => {
    const resolve = buildTrialRingResolver([]);
    expect(resolve({})).toBeNull();
  });
});
