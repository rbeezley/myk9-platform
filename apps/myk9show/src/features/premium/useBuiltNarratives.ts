import { useState } from 'react';
import type { GeneratedPremium } from '../../types/premium-types';

type Built = GeneratedPremium['builtNarratives'];

/**
 * MYK9-2280: the text "Use the show's current details" offers, from the latest successful facts
 * response: the editor's own Regenerate (`setBuilt`) or the facts the Premium tab hands down
 * (`incoming`), which may arrive after the editor opened (a reconnect). It never touches the
 * editable fields, and a response without it (offline) leaves the last one in place.
 */
export function useBuiltNarratives(
  facts: Pick<GeneratedPremium, 'builtNarratives'> | undefined,
  restored: Pick<GeneratedPremium, 'builtNarratives'> | undefined
) {
  const incoming = facts?.builtNarratives;
  const initial = restored?.builtNarratives;
  const [built, setBuilt] = useState<Built>(initial ?? incoming);
  const [seen, setSeen] = useState<Built>(incoming);
  if (incoming !== seen) {
    setSeen(incoming);
    if (incoming) setBuilt(incoming);
  }
  return [built, setBuilt] as const;
}
