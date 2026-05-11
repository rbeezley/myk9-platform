export function addDogSelection(
  selectedDogIds: string[],
  dogId: string,
  maxSelections: number
): string[] {
  if (selectedDogIds.includes(dogId)) return selectedDogIds;
  if (selectedDogIds.length >= maxSelections) return selectedDogIds;
  return [...selectedDogIds, dogId];
}

export function removeDogSelection(selectedDogIds: string[], dogId: string): string[] {
  return selectedDogIds.filter(id => id !== dogId);
}

/**
 * Merge visible dog ids into the existing selected-dog cart.
 * If the merged list exceeds maxSelections, later visible ids are silently dropped.
 */
export function addVisibleDogSelections(
  selectedDogIds: string[],
  visibleDogIds: string[],
  maxSelections: number
): string[] {
  return [...new Set([...selectedDogIds, ...visibleDogIds])].slice(0, maxSelections);
}

export function removeVisibleDogSelections(
  selectedDogIds: string[],
  visibleDogIds: string[]
): string[] {
  const visible = new Set(visibleDogIds);
  return selectedDogIds.filter(id => !visible.has(id));
}
