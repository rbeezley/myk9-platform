import { describe, expect, it } from 'vitest';
import { cachedDraftFor, withFreshFacts, type PremiumEditorDraft } from '../premiumDraftCache';
import { generatedPremium } from './fixtures/generatedPremium';

function draft(showId: string): PremiumEditorDraft {
  const original = generatedPremium();
  return {
    showId,
    original,
    supplemental: original.supplemental,
    narratives: { ...original.narratives, showHours: 'Hours edited' },
    generationError: null,
    inkSaver: true,
  };
}

describe('cachedDraftFor (MYK9-2236)', () => {
  it('has nothing to restore without a cache or a draft', () => {
    expect(cachedDraftFor(undefined, 'show-1', 'AKC')).toBeNull();
    expect(cachedDraftFor({ draft: null, loadedKey: null }, 'show-1', 'AKC')).toBeNull();
  });

  it("never restores another show's draft", () => {
    expect(cachedDraftFor({ draft: draft('show-2'), loadedKey: null }, 'show-1', 'AKC')).toBeNull();
  });

  it("restores this show's draft", () => {
    const cached = draft('show-1');
    expect(cachedDraftFor({ draft: cached, loadedKey: null }, 'show-1', cached.original.org)).toBe(
      cached
    );
  });

  // MYK9-2216: changing the organization invalidates the draft written for the old one.
  it('never restores a draft written for another organization', () => {
    const cached = {
      ...draft('show-1'),
      original: { ...draft('show-1').original, org: 'AKC' as const },
    };
    expect(cachedDraftFor({ draft: cached, loadedKey: null }, 'show-1', 'UKC')).toBeNull();
    expect(cachedDraftFor({ draft: cached, loadedKey: null }, 'show-1', null)).toBeNull();
  });
});

describe('withFreshFacts (MYK9-2236)', () => {
  it('takes the facts from the fresh premium and keeps the restored text baseline', () => {
    const restored = {
      ...generatedPremium('Old Venue'),
      narratives: { showHours: 'Restored hours', trialInformation: 'Restored info' },
    };
    const fresh = generatedPremium('New Venue');

    const merged = withFreshFacts(fresh, restored);

    expect(merged.show.venue).toBe('New Venue');
    expect(merged.narratives).toBe(restored.narratives);
    expect(merged.supplemental).toBe(restored.supplemental);
  });

  it('keeps the restored premium whole when the organization changed meanwhile', () => {
    const restored = generatedPremium('Old Venue');
    const fresh = { ...generatedPremium('New Venue'), org: 'UKC' as const };

    // Text written for AKC must not be relabelled UKC: the publish guard compares the org.
    expect(withFreshFacts(fresh, restored)).toBe(restored);
  });
});
