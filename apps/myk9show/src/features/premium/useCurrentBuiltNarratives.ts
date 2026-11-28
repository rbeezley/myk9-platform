import { useState } from 'react';
import type { GeneratedPremium } from '../../types/premium-types';

type Built = GeneratedPremium['builtNarratives'];

/**
 * MYK9-2280: the text "Use the show's current details" offers. It comes only from this visit's
 * current facts (`incoming`, what the Premium tab hands down) or the editor's own Regenerate
 * while those facts are still the same response. Never from a restored draft; a response without
 * it (offline, failed request, local fallback) offers nothing.
 */
export function useCurrentBuiltNarratives(incoming: Built) {
  const [regenerated, setRegenerated] = useState<{ built: Built; base: Built } | null>(null);
  const built = regenerated && regenerated.base === incoming ? regenerated.built : incoming;
  return [built, (next: Built) => setRegenerated({ built: next, base: incoming })] as const;
}
