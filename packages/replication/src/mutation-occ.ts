/**
 * Thrown when an UPDATE is rejected because the server's version column has
 * moved past the mutation's base server version.
 */
export class OccRejectionError extends Error {
  constructor(
    public readonly tableName: string,
    public readonly rowId: string,
    /** The OCC version the rejected write carried (informational / logging). */
    public readonly expectedVersion: number,
    /**
     * The authoritative current server version at rejection time, when a re-read
     * resolved it. The OCC handler advances the local row's OCC token to this so
     * the next queued/app write carries a fresh version instead of re-conflicting
     * forever (the ringside conflict-storm root cause). Falls back to
     * `expectedVersion` when a re-read wasn't possible.
     */
    public readonly currentServerVersion?: number
  ) {
    super(`OCC rejection: ${tableName}/${rowId} (expected server version ${expectedVersion})`);
    this.name = 'OccRejectionError';
  }
}

/**
 * True when an error represents an optimistic-concurrency (version) conflict —
 * either a re-classified {@link OccRejectionError} (direct UPDATE path) or the
 * raw `40001` raised by the `ringside_update_entry` SECURITY DEFINER RPC. Used to
 * route RPC conflicts into the OCC handler (advance token + back off) instead of
 * dead-lettering them, which would leave the local OCC token stale and let the
 * app regenerate the same conflicting write indefinitely.
 */
export function isVersionConflictError(error: unknown): boolean {
  if (error instanceof OccRejectionError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === '40001') return true;
  if (typeof candidate.message === 'string' && /version conflict/i.test(candidate.message)) {
    return true;
  }
  return false;
}

export interface EmptyUpdateClassificationOptions {
  tableName: string;
  rowId: string;
  serverVersion: number | undefined;
  serverCheck: { version?: number } | null | undefined;
}

export function classifyEmptyUpdateResult({
  tableName,
  rowId,
  serverVersion,
  serverCheck,
}: EmptyUpdateClassificationOptions): Error {
  if (serverVersion !== undefined) {
    if (!serverCheck) {
      return new Error(`Row ${rowId} on ${tableName} no longer exists server-side.`);
    }

    if (serverCheck.version !== serverVersion) {
      // Carry the freshly re-read server version so the OCC handler can advance
      // the local token, not the stale value the rejected write carried.
      return new OccRejectionError(tableName, rowId, serverVersion, serverCheck.version);
    }
  }

  return new Error(
    `RLS policy blocked UPDATE on ${tableName} for row ${rowId}. ` +
      `Check that the authenticated user has the required role.`
  );
}

export function getReturnedServerVersion(rows: Array<{ version?: number }> | null | undefined): number | undefined {
  return rows?.[0]?.version;
}
