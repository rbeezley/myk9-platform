/**
 * Overlays of this device's UNSENT writes onto the dog read's PostgREST data
 * (MYK9-1071). The readers stay online; these only make a queued edit visible
 * before it uploads, and never read a row the server already has from the
 * replica (so a server-side delete cannot reappear).
 */

/** Replace a server registration with the queued local edit of the same id. */
export function overlayPendingRegistrationEdits(
  map: Map<string, Record<string, unknown>[]>,
  unsentRows: Record<string, unknown>[]
): void {
  const byId = new Map(unsentRows.map(row => [row.id, row]));
  for (const [dogId, rows] of map) {
    if (rows.some(row => byId.has(row.id))) {
      map.set(
        dogId,
        rows.map(row => (byId.has(row.id) ? { ...row, ...byId.get(row.id)! } : row))
      );
    }
  }
}
