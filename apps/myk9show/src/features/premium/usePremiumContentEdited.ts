import { useEffect, useRef } from 'react';
import type { GeneratedPremium } from '@/types/premium-types';

/**
 * MYK9-2201: reports whether the narratives or supplemental details differ from what the editor
 * first held. The raw editor state is compared, so the async cover-image resolve that rewrites
 * the final premium never reads as an edit.
 */
export function usePremiumContentEdited(
  supplemental: GeneratedPremium['supplemental'] | null,
  narratives: GeneratedPremium['narratives'] | null,
  onEditedChange: ((edited: boolean) => void) | undefined
) {
  const loadedKeyRef = useRef<string | null>(null);
  const onEditedChangeRef = useRef(onEditedChange);
  useEffect(() => {
    onEditedChangeRef.current = onEditedChange;
  }, [onEditedChange]);
  useEffect(() => {
    if (!supplemental || !narratives) return;
    const key = JSON.stringify([supplemental, narratives]);
    loadedKeyRef.current ??= key;
    onEditedChangeRef.current?.(key !== loadedKeyRef.current);
  }, [supplemental, narratives]);
}
