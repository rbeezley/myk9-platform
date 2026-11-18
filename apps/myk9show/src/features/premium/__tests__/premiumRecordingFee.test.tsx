/**
 * MYK9-2044: the recording fee statement generate-premium sends reaches the premium's facts,
 * and survives the parse the generate call goes through (which strips unknown keys). The
 * per-style printed line is pinned in premiumFactsParity.test.tsx.
 */
import { describe, expect, it } from 'vitest';
import { generatedPremium } from './fixtures/generatedPremium';
import { buildPremiumFacts } from '../premiumFacts';
import { parseGeneratedPremium } from '../premiumPublishSchema';
import type { GeneratedPremium } from '@/types/premium-types';

const FEE_2027 = {
  registry: 'AKC' as const,
  amountCents: 550,
  text: 'AKC recording fee: $5.50 per entry',
};

function withFee(recordingFee: GeneratedPremium['recordingFee']): GeneratedPremium {
  return { ...generatedPremium(), recordingFee };
}

describe('premium recording fee fact (MYK9-2044)', () => {
  it('carries the statement the function wrote', () => {
    expect(buildPremiumFacts(withFee(FEE_2027)).recordingFee).toBe(
      'AKC recording fee: $5.50 per entry'
    );
  });

  it.each([null, undefined])('has no line when the function sent %s', recordingFee => {
    expect(buildPremiumFacts(withFee(recordingFee)).recordingFee).toBeNull();
  });

  it('survives the same parse the generate call goes through', () => {
    const wire = (premium: GeneratedPremium) => JSON.parse(JSON.stringify(premium));

    expect(buildPremiumFacts(parseGeneratedPremium(wire(withFee(FEE_2027)))).recordingFee).toBe(
      'AKC recording fee: $5.50 per entry'
    );
    expect(buildPremiumFacts(parseGeneratedPremium(wire(withFee(null)))).recordingFee).toBeNull();
  });
});
