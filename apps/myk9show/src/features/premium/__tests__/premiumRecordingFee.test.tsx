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
  rates: [{ amountCents: 550, appliesFrom: null }],
  text: 'AKC recording fee: $5.50 per entry',
};
const NEW_YEAR_FEE = {
  registry: 'AKC' as const,
  rates: [
    { amountCents: 450, appliesFrom: null },
    { amountCents: 550, appliesFrom: '2027-01-01' },
  ],
  text: 'AKC recording fee: $4.50 per entry; $5.50 per entry from January 1, 2027',
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

  it('keeps both rates of a statement across a rate change through the parse', () => {
    const parsed = parseGeneratedPremium(JSON.parse(JSON.stringify(withFee(NEW_YEAR_FEE))));

    expect(parsed.recordingFee).toEqual(NEW_YEAR_FEE);
    expect(buildPremiumFacts(parsed).recordingFee).toBe(NEW_YEAR_FEE.text);
  });

  it('still parses a stored premium with no recording fee, or one saved before it carried rates', () => {
    // The shared fixture predates the recording fee and carries no such key.
    expect('recordingFee' in generatedPremium()).toBe(false);
    expect(
      parseGeneratedPremium(JSON.parse(JSON.stringify(generatedPremium()))).recordingFee
    ).toBeUndefined();

    const earlyShape = {
      ...generatedPremium(),
      recordingFee: {
        registry: 'AKC',
        amountCents: 550,
        text: 'AKC recording fee: $5.50 per entry',
      },
    };
    const parsed = parseGeneratedPremium(JSON.parse(JSON.stringify(earlyShape)));
    expect(parsed.recordingFee).toEqual({
      registry: 'AKC',
      rates: [],
      text: 'AKC recording fee: $5.50 per entry',
    });
    expect(buildPremiumFacts(parsed).recordingFee).toBe('AKC recording fee: $5.50 per entry');
  });
});
