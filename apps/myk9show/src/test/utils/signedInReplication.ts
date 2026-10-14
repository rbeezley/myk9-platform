import { vi } from 'vitest';

/** The one table method the account stamp check calls (MYK9-1133). */
interface IdentityReportingTable {
  getCurrentAuthUserId(): Promise<string | null>;
}

/**
 * Make a REAL replicated table report `authUserId` as the signed-in account,
 * as the app's startup wiring does through the shared mutation manager. A table
 * with no manager cannot name its account, so it never owns a scope it synced.
 * A spy, so a test's own manager wiring is left alone; call it again after
 * `vi.restoreAllMocks()`.
 */
export function signInReplicatedTable(table: IdentityReportingTable, authUserId = 'user-test') {
  vi.spyOn(table, 'getCurrentAuthUserId').mockResolvedValue(authUserId);
}
