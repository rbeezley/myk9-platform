/**
 * A judge's place of residence as "City, ST" (MYK9-2067, AKC Ch. 3 §15). A judge with no city
 * has no residence to print, even when a state is on file: a bare "IL" next to a name reads as
 * a typo. A city with no state prints the city alone. Null when there is nothing to print.
 */
export function formatJudgeResidence(
  city: string | null | undefined,
  state: string | null | undefined
): string | null {
  const place = city?.trim();
  if (!place) return null;
  const region = state?.trim();
  return region ? `${place}, ${region}` : place;
}
