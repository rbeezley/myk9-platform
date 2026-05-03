import { describe, it, expect } from 'vitest';
import { detectConsecutiveOverrides } from '../detectConsecutiveOverrides';
import type { PremiumGeneration } from '../../../types/premium-types';

const makeGen = (fields: string[]): Pick<PremiumGeneration, 'fieldOverrides'> => ({
  fieldOverrides: Object.fromEntries(
    fields.map(f => [f, { templateValue: 'old', finalValue: 'new' }])
  ),
});

describe('detectConsecutiveOverrides', () => {
  it('returns empty array when no generations', () => {
    expect(detectConsecutiveOverrides([])).toEqual([]);
  });

  it('returns field overridden 3+ times', () => {
    const gens = [makeGen(['vet_clinic']), makeGen(['vet_clinic']), makeGen(['vet_clinic'])];
    expect(detectConsecutiveOverrides(gens)).toContain('vet_clinic');
  });

  it('does not return field overridden fewer than threshold times', () => {
    const gens = [makeGen(['vet_clinic']), makeGen(['vet_clinic'])];
    expect(detectConsecutiveOverrides(gens)).not.toContain('vet_clinic');
  });

  it('respects custom threshold', () => {
    const gens = [makeGen(['vet_clinic']), makeGen(['vet_clinic'])];
    expect(detectConsecutiveOverrides(gens, 2)).toContain('vet_clinic');
  });

  it('handles multiple fields independently', () => {
    const gens = [
      makeGen(['vet_clinic', 'hospitality']),
      makeGen(['vet_clinic', 'hospitality']),
      makeGen(['vet_clinic']),
    ];
    const result = detectConsecutiveOverrides(gens);
    expect(result).toContain('vet_clinic');
    expect(result).not.toContain('hospitality');
  });
});
