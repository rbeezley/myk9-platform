import { describe, expect, it } from 'vitest';
import { classifyPremiumPublishState, PREMIUM_STALE_TOLERANCE_MS } from '../premiumPublishState';

const URL = 'https://example.test/premium.pdf';
const PUBLISHED = '2026-05-09T12:00:00.000Z';

function at(offsetMs: number): string {
  return new Date(new Date(PUBLISHED).getTime() + offsetMs).toISOString();
}

describe('classifyPremiumPublishState', () => {
  it('is unpublished when the premium was never published', () => {
    expect(
      classifyPremiumPublishState({
        publishedPremiumUrl: null,
        publishedPremiumAt: null,
        updatedAt: PUBLISHED,
      })
    ).toBe('unpublished');
  });

  it('is current when the show was last changed before the publish', () => {
    expect(
      classifyPremiumPublishState({
        publishedPremiumUrl: URL,
        publishedPremiumAt: PUBLISHED,
        updatedAt: at(-60_000),
      })
    ).toBe('published-current');
  });

  it('is current when the change and the publish carry the same time', () => {
    expect(
      classifyPremiumPublishState({
        publishedPremiumUrl: URL,
        publishedPremiumAt: PUBLISHED,
        updatedAt: PUBLISHED,
      })
    ).toBe('published-current');
  });

  it('is current for a change inside the tolerance and stale just past it', () => {
    const base = { publishedPremiumUrl: URL, publishedPremiumAt: PUBLISHED };
    expect(
      classifyPremiumPublishState({ ...base, updatedAt: at(PREMIUM_STALE_TOLERANCE_MS) })
    ).toBe('published-current');
    expect(
      classifyPremiumPublishState({ ...base, updatedAt: at(PREMIUM_STALE_TOLERANCE_MS + 1) })
    ).toBe('published-stale');
  });

  it('is stale when the show changed well after the publish', () => {
    expect(
      classifyPremiumPublishState({
        publishedPremiumUrl: URL,
        publishedPremiumAt: PUBLISHED,
        updatedAt: at(3_600_000),
      })
    ).toBe('published-stale');
  });
});
