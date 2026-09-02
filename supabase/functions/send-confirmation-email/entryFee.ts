/** `entries.entry_fee` is stored as a decimal dollar amount, not cents. */
export function formatEntryFee(entryFee: number | null | undefined): string {
  return entryFee == null ? '—' : `$${entryFee.toFixed(2)}`;
}
