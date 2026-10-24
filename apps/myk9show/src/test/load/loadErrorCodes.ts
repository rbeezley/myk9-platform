/**
 * Per-code API error counts (MYK9-1271).
 *
 * A bare `failedRequestCount` cannot tell a pooler that ran out of connections
 * (PGRST003, HTTP 503) from a statement timeout (57014, HTTP 500) from an RLS
 * denial (42501, HTTP 403) -- and they point at different fixes. Each failed
 * response is therefore counted by HTTP status and PostgREST/Postgres error code.
 *
 * `status` 0 is a request that never produced a response: `transport` when the
 * network dropped it, `aborted` when the page itself gave up on it (the 30 s
 * client read deadline of MYK9-1351; CDP reports the load as canceled). The
 * two point at different fixes, and the 2026-10-23 rehearsal counted 961
 * aborts as transport failures (MYK9-1374).
 * `code` is `none` when a response carried no readable code (an HTML gateway
 * page, an empty body, a body that could not be fetched).
 */
export interface ApiErrorCount {
  readonly status: number;
  readonly code: string;
  readonly count: number;
}

export const NO_ERROR_CODE = 'none';
export const TRANSPORT_ERROR_CODE = 'transport';
export const ABORTED_ERROR_CODE = 'aborted';

/**
 * A virtual-user request sample with the error code. `VirtualUserRequestSample`
 * in loadVirtualUser.ts carries `ok` and `status` only; the virtual-user client
 * must populate `code` from the response body for it to be counted by code.
 */
export interface VirtualUserErrorSample {
  readonly durationMs: number;
  readonly ok: boolean;
  readonly status?: number;
  readonly code?: string;
}

const CODE_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

/** Reads `code` from a PostgREST/Postgres JSON error body. Never throws. */
export function extractApiErrorCode(body: string | undefined): string | undefined {
  if (!body) return undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && 'code' in parsed) {
      const code = (parsed as { code: unknown }).code;
      if (typeof code === 'string' && CODE_PATTERN.test(code)) return code;
    }
    return undefined;
  } catch {
    // A truncated body still usually carries the code in its first bytes.
    const match = /"code"\s*:\s*"([A-Za-z0-9_]{3,16})"/.exec(body);
    return match?.[1];
  }
}

export class ApiErrorTally {
  private readonly counts = new Map<string, ApiErrorCount>();

  record(status: number, code?: string): void {
    const resolved = code ?? (status === 0 ? TRANSPORT_ERROR_CODE : NO_ERROR_CODE);
    const key = `${status}|${resolved}`;
    const existing = this.counts.get(key);
    this.counts.set(key, { status, code: resolved, count: (existing?.count ?? 0) + 1 });
  }

  entries(): ApiErrorCount[] {
    return sortApiErrorCounts([...this.counts.values()]);
  }
}

function sortApiErrorCounts(counts: readonly ApiErrorCount[]): ApiErrorCount[] {
  return [...counts].sort(
    (left, right) =>
      right.count - left.count || left.status - right.status || left.code.localeCompare(right.code)
  );
}

/** Sums per-shard counts. Tolerates shards that predate the field. */
export function mergeApiErrorCounts(
  lists: readonly (readonly ApiErrorCount[] | undefined)[]
): ApiErrorCount[] {
  const merged = new Map<string, ApiErrorCount>();
  for (const list of lists) {
    for (const entry of list ?? []) {
      const key = `${entry.status}|${entry.code}`;
      const existing = merged.get(key);
      merged.set(key, { ...entry, count: (existing?.count ?? 0) + entry.count });
    }
  }
  return sortApiErrorCounts([...merged.values()]);
}

export function formatApiErrorCounts(counts: readonly ApiErrorCount[] | undefined): string {
  if (!counts || counts.length === 0) return 'none';
  return counts
    .map(
      entry =>
        `${entry.code} (HTTP ${entry.status === 0 ? 'no response' : entry.status}) x${entry.count}`
    )
    .join(', ');
}
