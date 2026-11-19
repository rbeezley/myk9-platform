import { describe, expect, it } from 'vitest';
import { normalizeEntryLimit, premiumEntryLimitText } from '../premiumEntryLimit';
import { generatedPremium } from './fixtures/generatedPremium';

describe('premiumEntryLimitText (MYK9-2220)', () => {
  const ukc = (limit?: number | null) => {
    const premium = generatedPremium();
    premium.org = 'UKC';
    if (limit !== undefined) premium.show.maxTotalEntries = limit;
    return premium;
  };

  it('states the limit as one plain line on a UKC premium', () => {
    expect(premiumEntryLimitText(ukc(120))).toBe('Total entry limit: 120 entries.');
    expect(premiumEntryLimitText(ukc(1))).toBe('Total entry limit: 1 entry.');
  });

  it.each([null, undefined, 0, -5])('says nothing for no limit (%s)', limit => {
    expect(premiumEntryLimitText(ukc(limit))).toBeNull();
  });

  it('states the limit on an ASCA premium too (§1.5.12)', () => {
    const premium = ukc(80);
    premium.org = 'ASCA';
    expect(premiumEntryLimitText(premium)).toBe('Total entry limit: 80 entries.');
  });

  it('says nothing on AKC, even with a limit', () => {
    const premium = ukc(120);
    premium.org = 'AKC';
    expect(premiumEntryLimitText(premium)).toBeNull();
  });

  it('normalizes form strings and rejects non-positive or non-integer values', () => {
    expect(normalizeEntryLimit('75')).toBe(75);
    expect(normalizeEntryLimit('')).toBeNull();
    expect(normalizeEntryLimit(2.5)).toBeNull();
    expect(normalizeEntryLimit(undefined)).toBeNull();
  });
});
