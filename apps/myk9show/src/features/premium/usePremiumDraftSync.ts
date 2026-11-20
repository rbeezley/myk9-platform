import { useEffect, useRef } from 'react';
import type { GeneratedPremium } from '@/types/premium-types';
import { isUneditedDraft, storeDraft, type PremiumDraftCache } from './premiumDraftCache';

interface EditorState {
  showId: string;
  original: GeneratedPremium | null;
  supplemental: GeneratedPremium['supplemental'] | null;
  narratives: GeneratedPremium['narratives'] | null;
  generationError: string | null;
  inkSaver: boolean;
}

/**
 * MYK9-2236: keeps the premium editor's draft cache current, and decides what hiding means.
 * With a cache, hidden is set aside, not abandoned, so Save still asks about the edits. An
 * unedited premium is still released from the form (`onRelease`), so a look at the tab is not
 * a change to save.
 */
export function usePremiumDraftSync(
  cache: PremiumDraftCache | undefined,
  active: boolean,
  state: EditorState,
  onRelease: () => void
) {
  const { showId, original, supplemental, narratives, generationError, inkSaver } = state;
  const onReleaseRef = useRef(onRelease);
  useEffect(() => {
    onReleaseRef.current = onRelease;
  }, [onRelease]);

  useEffect(() => {
    if (!cache || !original || !supplemental || !narratives) return;
    storeDraft(cache, { showId, original, supplemental, narratives, generationError, inkSaver });
  }, [cache, showId, original, supplemental, narratives, generationError, inkSaver]);

  useEffect(() => {
    if (active || !cache || !isUneditedDraft(cache, supplemental, narratives)) return;
    onReleaseRef.current();
  }, [active, cache, supplemental, narratives]);
}
