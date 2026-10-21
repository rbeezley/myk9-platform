/**
 * The entry limit as a visitor reads it in a landing fact strip. No limit is
 * stated plainly ("No entry limit"), never a bare "Open" that reads like a
 * status.
 */
export function formatEntryLimit(entryLimit: number | null): string {
  return entryLimit == null ? 'No entry limit' : `${entryLimit} runs`;
}
