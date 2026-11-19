import { describe, expect, it, vi } from 'vitest';

import { resolvePremiumNarratives } from './premiumNarratives.ts';

const published = { showHours: 'Published hours', trialInformation: 'Published trial info' };

describe('resolvePremiumNarratives', () => {
  it('facts-only never runs the generation attempt (no narrative model, no rate limiter)', async () => {
    const generate = vi.fn();
    const result = await resolvePremiumNarratives({ factsOnly: true, published, generate });
    expect(generate).not.toHaveBeenCalled();
    expect(result).toEqual({ narratives: published, narrativeGenerationError: null });
  });

  it('a normal request runs the generation attempt and returns its outcome', async () => {
    const outcome = {
      narratives: { showHours: 'New hours', trialInformation: 'New info' },
      narrativeGenerationError: null,
    };
    const generate = vi.fn().mockResolvedValue(outcome);
    const result = await resolvePremiumNarratives({ factsOnly: false, published, generate });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result).toBe(outcome);
  });
});
