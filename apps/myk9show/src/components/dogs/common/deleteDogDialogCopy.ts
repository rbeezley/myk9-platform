// Copy for the delete-dog confirmation dialog. Kept in a sibling module so the
// component file only exports components (react-refresh) and the pure
// description builder can be unit-tested directly.

export const baseDescription =
  'This will mark the dog as deleted and hide it from normal view. An administrator can restore it later if needed.';

/**
 * Builds the confirmation copy. When the dog has live entries, warns that the
 * delete cascades to them (see migration 20260616130000). `undefined` (count
 * still loading) shows no warning.
 */
export function buildDescription(activeEntryCount?: number): string {
  if (!activeEntryCount || activeEntryCount <= 0) return baseDescription;
  const noun = activeEntryCount === 1 ? 'entry' : 'entries';
  return (
    `This dog has ${activeEntryCount} active ${noun}, which will also be removed ` +
    `from their shows. ${baseDescription}`
  );
}
