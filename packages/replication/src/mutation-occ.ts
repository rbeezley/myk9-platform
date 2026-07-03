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

/**
 * The authoritative current server version a conflict carries, if known. The
 * `ringside_update_entry` RPC raises its `40001` with the current version in the
 * Postgres DETAIL field (PostgREST surfaces it as `error.details`), because the
 * ringside caller's own role may be denied a direct entries read and so cannot
 * re-read the version itself. Returns undefined when no version is available
 * (e.g. a function version predating that change), in which case the OCC token
 * simply isn't advanced this round.
 */
export function getConflictServerVersion(error: unknown): number | undefined {
  if (error instanceof OccRejectionError) return error.currentServerVersion;
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as { details?: unknown; detail?: unknown };
  const raw = typeof candidate.details === 'string' ? candidate.details : candidate.detail;
  if (typeof raw !== 'string') return undefined;
  const parsed = Number(raw.trim());
  return Number.isInteger(parsed) ? parsed : undefined;
}

export interface EmptyUpdateClassificationOptions {
  tableName: string;
  rowId: string;
  serverVersion: number | undefined;
  serverCheck: { version?: number } | null | undefined;
  serverCheckError?: unknown;
}

export function classifyEmptyUpdateResult({
  tableName,
  rowId,
  serverVersion,
  serverCheck,
  serverCheckError,
}: EmptyUpdateClassificationOptions): Error {
  if (serverVersion !== undefined) {
    if (serverCheckError) {
      return makeRlsUpdateError(tableName, rowId);
    }

    if (!serverCheck) {
      return new Error(`Row ${rowId} on ${tableName} no longer exists server-side.`);
    }

    if (serverCheck.version !== serverVersion) {
      // Carry the freshly re-read server version so the OCC handler can advance
      // the local token, not the stale value the rejected write carried.
      return new OccRejectionError(tableName, rowId, serverVersion, serverCheck.version);
    }
  }

  return makeRlsUpdateError(tableName, rowId);
}

function makeRlsUpdateError(tableName: string, rowId: string): Error {
  return new Error(
    `RLS policy blocked UPDATE on ${tableName} for row ${rowId}. ` +
      `Check that the authenticated user has the required role.`
  );
}

export function getReturnedServerVersion(rows: Array<{ version?: number }> | null | undefined): number | undefined {
  return rows?.[0]?.version;
}
