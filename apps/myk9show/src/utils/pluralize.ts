/**
 * Count-aware noun forms.
 *
 * Extracted from `features/show-today/ShowTodayBanner.tsx`, which had the only
 * copy, so a second caller does not fork it (F9: the class-selector rendered
 * "1 classes" for the Detective element, which offers a single class).
 */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/** `pluralize` with the count prefixed: `countLabel(1, 'class', 'classes')` -> "1 class". */
export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${pluralize(count, singular, plural)}`;
}
