import { useEffect, useRef, useState } from 'react';
import type { GeneratedPremium } from '@/types/premium-types';

/**
 * MYK9-2201: reports whether the narratives or supplemental details differ from what the editor
 * first held. The raw editor state is compared, so the async cover-image resolve that rewrites
 * the final premium never reads as an edit. `baseline` (MYK9-2236) holds the first state outside
 * the editor, so a remount restoring the secretary's edits still reports them as edits.
 */
export function usePremiumContentEdited(
  supplemental: GeneratedPremium['supplemental'] | null,
  narratives: GeneratedPremium['narratives'] | null,
  onEditedChange: ((edited: boolean) => void) | undefined,
  baseline?: { loadedKey: string | null }
) {
  const [ownBaseline] = useState<{ loadedKey: string | null }>(() => ({ loadedKey: null }));
  const holder = baseline ?? ownBaseline;
  const onEditedChangeRef = useRef(onEditedChange);
  useEffect(() => {
    onEditedChangeRef.current = onEditedChange;
  }, [onEditedChange]);
  useEffect(() => {
    if (!supplemental || !narratives) return;
    const key = JSON.stringify([supplemental, narratives]);
    holder.loadedKey ??= key;
    onEditedChangeRef.current?.(key !== holder.loadedKey);
  }, [holder, supplemental, narratives]);
}
