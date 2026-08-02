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

/** Custom SQLSTATE raised by `ringside_update_entry` while the MYK9-115 breaker
 * is contained. Not a Postgres class — it is deliberately distinguishable from
 * `40001` so the client can tell "you lost a race" from "stop asking". */
export const CONTAINMENT_SQLSTATE = 'RS429';

/** Used when the server sends no usable `retry_after` hint. Never 0: the whole
 * point of containment is that the client waits. */
export const CONTAINMENT_DEFAULT_RETRY_AFTER_MS = 60_000;

/**
 * Thrown when ringside scoring is under admission control (MYK9-115).
 *
 * INTENT: this is NOT a subclass of {@link OccRejectionError}, and that is the
 * whole design. A version conflict means "your token is stale, take the fresh
 * one and try again" — retrying is correct and immediate. Containment means the
 * server is shedding load and has asked every client to back off; routing it
 * into the OCC path would hammer the breaker that exists to stop the hammering.
 * The authoritative version still rides along in DETAIL, so the token can be
 * advanced while the upload runner pauses.
 */
export class ContainmentError extends Error {
  constructor(
    public readonly tableName: string,
    public readonly rowId: string,
    /** Authoritative current server version, from the RS429 DETAIL. */
    public readonly currentServerVersion: number | undefined,
    /** How long the server asked us to wait, in ms. */
    public readonly retryAfterMs: number
  ) {
    super(
      `Ringside scoring is contained: ${tableName}/${rowId} paused for ${Math.round(
        retryAfterMs / 1000
      )}s`
    );
    this.name = 'ContainmentError';
  }
}

/** True for the RS429 raised by `ringside_update_entry` while contained.
 * Matches on the CODE only — the message is human-facing copy that may change,
 * and matching prose would make an unrelated error containing the same words
 * silently pause the outbox. */
export function isContainmentError(error: unknown): boolean {
  if (error instanceof ContainmentError) return true;
  if (typeof error !== 'object' || error === null) return false;
  return (error as { code?: unknown }).code === CONTAINMENT_SQLSTATE;
}

/** Read `retry_after=<seconds>` out of the Postgres HINT, in ms. Anything
 * missing, unparseable or non-positive falls back to the default rather than
 * collapsing to an immediate retry. */
export function parseContainmentRetryAfterMs(error: unknown): number {
  if (typeof error !== 'object' || error === null) return CONTAINMENT_DEFAULT_RETRY_AFTER_MS;
  const hint = (error as { hint?: unknown }).hint;
  if (typeof hint !== 'string') return CONTAINMENT_DEFAULT_RETRY_AFTER_MS;
  const match = /retry_after=(\d+)/.exec(hint);
  if (!match) return CONTAINMENT_DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return CONTAINMENT_DEFAULT_RETRY_AFTER_MS;
  return seconds * 1000;
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
  // Containment is checked FIRST and excluded. RS429 carries a version in DETAIL
  // exactly like 40001 does, so a future wording change to either message could
  // otherwise let the prose fallback below capture it and route a back-off
  // instruction into the immediate-retry path.
  if (isContainmentError(error)) return false;
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

export function getReturnedServerVersion(
  rows: Array<{ version?: number }> | null | undefined
): number | undefined {
  return rows?.[0]?.version;
}
