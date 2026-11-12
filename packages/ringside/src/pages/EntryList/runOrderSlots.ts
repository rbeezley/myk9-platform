/**
 * runOrderSlots — which run-order numbers a drag-and-drop reorder writes.
 *
 * A drag reorders the entries the steward can SEE, which is not always the whole class: a search
 * term or a combined list's Section A/B tab shows a subset. Numbering that subset 1..n collides
 * with the real run orders of the dogs it hides (MYK9-1808). A reorder inside a subset therefore
 * keeps the run-order slots the subset already held and hands them out in the new order, so the
 * dogs outside it never move. For a whole class holding 1..n this is the same as numbering 1..n.
 *
 * If any dog in the subset has no stored run order there are no slots to keep, so it falls back
 * to numbering the subset 1..n (a whole class that was never ordered).
 */

interface RunOrderSlotEntry {
  exhibitorOrder?: number | null | undefined;
}

export function assignRunOrderSlots<T extends RunOrderSlotEntry>(
  previous: readonly T[],
  reordered: readonly T[]
): T[] {
  const held = previous.map(entry => entry.exhibitorOrder);
  const slots = held.every((order): order is number => typeof order === 'number' && order > 0)
    ? [...held].sort((a, b) => a - b)
    : null;
  return reordered.map((entry, index) => ({
    ...entry,
    exhibitorOrder: slots?.[index] ?? index + 1,
  }));
}
