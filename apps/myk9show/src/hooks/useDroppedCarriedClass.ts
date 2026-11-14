import { useState } from 'react';

/**
 * The class a link carried that the page could not show (MYK9-1996). The page rewrites the URL as
 * soon as it drops the stale id, so the miss is held here until the secretary picks a class.
 * Returns the missed id, or null.
 */
export function useDroppedCarriedClass(
  droppedClassIds: readonly string[],
  pickedClassCount: number
): string | null {
  const [missed, setMissed] = useState<string | null>(null);
  const dropped = droppedClassIds[0] ?? null;
  // Adjusted during render, not in an effect, so the notice appears in the same commit that
  // drops the id. A picked class always wins, and each branch settles after one update, so a
  // link with one stale and one valid class cannot loop.
  if (pickedClassCount > 0) {
    if (missed !== null) setMissed(null);
  } else if (dropped !== null && dropped !== missed) {
    setMissed(dropped);
  }
  return pickedClassCount > 0 ? null : missed;
}
