import { describe, expect, it } from 'vitest';
import {
  FAQ_ITEMS,
  FEES_LINK,
  PRICING_CARDS,
  PRICING_LEDE,
  TRUST_ITEMS,
  feeHeadline,
  feePhrase,
  withFee,
} from '../landingFacts';
import { BANNED_COPY } from '../lifecycleStories';

const ALL_COPY = [
  ...TRUST_ITEMS.flatMap(item => [item.lead, item.text]),
  PRICING_LEDE,
  ...PRICING_CARDS.flatMap(card => [card.who, card.price ?? '', ...card.points]),
  FEES_LINK.label,
  ...FAQ_ITEMS.flatMap(item => [item.q, ...item.a]),
];

describe('landing trust bar, pricing and FAQ copy', () => {
  it('contains no banned copy', () => {
    for (const text of ALL_COPY) for (const re of BANNED_COPY) expect(text).not.toMatch(re);
  });

  // The rate lives in platform_settings and a site admin can change it with no deploy.
  it('never writes the service fee as a number', () => {
    for (const text of ALL_COPY) expect(text, text).not.toMatch(/\d\s*%|\$\s*\d/);
  });

  it('names the fee wherever the copy speaks about what exhibitors pay', () => {
    const withToken = ALL_COPY.filter(text => text.includes('{fee}'));
    expect(withToken).toHaveLength(2);
    expect(PRICING_LEDE).toContain('{fee}');
    expect(PRICING_CARDS.filter(card => card.price === null)).toHaveLength(1);
  });

  it('fills the fee in from the live label, and admits it when the rate is not read', () => {
    expect(feePhrase('7%')).toBe('a 7% service fee');
    expect(feePhrase(null)).toBe('a service fee');
    expect(feeHeadline('7% + $0.30')).toBe('7% + $0.30 service fee');
    expect(feeHeadline(null)).toBe('A service fee');
    expect(withFee('Pay {fee} here, {fee} there.', '5%')).toBe(
      'Pay a 5% service fee here, a 5% service fee there.'
    );
    expect(withFee(PRICING_LEDE, null)).not.toContain('{fee}');
  });

  it('carries four trust facts and the six agreed questions, none repeated', () => {
    expect(TRUST_ITEMS).toHaveLength(4);
    expect(FAQ_ITEMS.map(item => item.q)).toEqual([
      'Does it work with no internet?',
      'Which registries and sports?',
      'What does it cost?',
      'How do results get to the registry?',
      'What does switching involve?',
      'Can we try it before a real show?',
    ]);
    expect(new Set(ALL_COPY.filter(Boolean)).size).toBe(ALL_COPY.filter(Boolean).length);
    for (const item of FAQ_ITEMS) expect(item.a.length, item.q).toBeGreaterThan(0);
  });

  it('sends readers to the one fee explanation, not a second copy of it', () => {
    expect(FEES_LINK.to).toBe('/fees');
  });
});
