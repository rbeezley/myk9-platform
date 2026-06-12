import { describe, it, expect } from 'vitest';
import { parsePremiumPriceIds, priceIdToTier } from './premiumPrices';

const FALLBACK = ['price_live_a', 'price_live_b'];

describe('parsePremiumPriceIds', () => {
  it('MERGES the secret with the live fallback — a sandbox-only secret can never downgrade live subscribers', () => {
    expect(parsePremiumPriceIds('price_x, price_y ,price_z', FALLBACK)).toEqual([
      'price_live_a',
      'price_live_b',
      'price_x',
      'price_y',
      'price_z',
    ]);
  });

  it('dedupes ids that appear in both the secret and the fallback', () => {
    expect(parsePremiumPriceIds('price_live_a,price_new', FALLBACK)).toEqual([
      'price_live_a',
      'price_live_b',
      'price_new',
    ]);
  });

  it('keeps the live ids when the secret is unset or blank', () => {
    expect(parsePremiumPriceIds(undefined, FALLBACK)).toEqual(FALLBACK);
    expect(parsePremiumPriceIds('', FALLBACK)).toEqual(FALLBACK);
    expect(parsePremiumPriceIds(' , ', FALLBACK)).toEqual(FALLBACK);
  });
});

describe('priceIdToTier', () => {
  it('maps a configured premium price to premium', () => {
    expect(priceIdToTier('price_x', ['price_x'])).toBe('premium');
  });

  it('maps unknown, null, and undefined prices to free — never accidental premium', () => {
    expect(priceIdToTier('price_other', ['price_x'])).toBe('free');
    expect(priceIdToTier(null, ['price_x'])).toBe('free');
    expect(priceIdToTier(undefined, ['price_x'])).toBe('free');
  });
});
