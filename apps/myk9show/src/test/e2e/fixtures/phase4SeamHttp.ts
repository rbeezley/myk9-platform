/**
 * Phase 4 seam harness — shared PostgREST/HTTP layer.
 *
 * Types, constants, and the low-level request/response helpers used by both the
 * per-seam handlers (`phase4SeamHandlers.ts`) and the dispatcher/Playwright
 * wiring (`phase4SeamRoutes.ts`). Kept dependency-free (no app, no Playwright)
 * so it loads under vitest and forms the base of the module DAG.
 */

export type SeamName = 'scratch' | 'waitlist' | 'message' | 'refund' | 'results' | 'read';

export interface SeamRequest {
  method: string;
  url: string;
  /** Parsed JSON body, or null for GET/no-body. */
  postData: unknown;
  /** Lowercased request headers (used to detect PostgREST single-object reads). */
  headers?: Record<string, string>;
}

export interface SeamResponse {
  /** 'fulfill' = served locally (safe); 'continue' = pass through to network. */
  action: 'fulfill' | 'continue';
  status: number;
  body: unknown;
  contentType: string;
}

export interface AuditEntry {
  method: string;
  url: string;
  table: string | null;
  payload: unknown;
  /** True when the request was served locally instead of hitting the network. */
  fulfilled: boolean;
  status: number;
  seam: SeamName | null;
  /** True for a write to fixture-owned data that we refused to pass through. */
  isFixtureWrite: boolean;
  /** True for a non-auth app-data mutation we could not map to a handler. */
  isUnhandledMutation: boolean;
  elapsedMs: number;
}

export interface HandleOptions {
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
  /** Extra app-data write paths allowed to pass through (rare). */
  allowWritePaths?: RegExp[];
  /**
   * Render-only identity remap: rewrite served exhibitor-A-owned rows to the
   * REAL signed-in exhibitor's ids so client-side "my entries" filters don't drop
   * the fixture rows. Off by default (unit tests run without it).
   */
  identity?: { exhibitorUserId?: string; exhibitorPersonId?: string };
}

export const JSON_CT = 'application/json';
export const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const FIXTURE_TABLES = new Set([
  'entries',
  'enrollments',
  'waitlist_entries',
  'show_messages',
  'show_message_threads',
  'classes',
  'view_entry_with_results',
]);
export const FIXTURE_FUNCTIONS = new Set(['stripe-refund-entry']);

/**
 * Replication sync-down endpoints served READ-ONLY from fixture state so the
 * app's own sync populates IndexedDB with the fixture show (render-only walk).
 * Deliberately separate from FIXTURE_TABLES: a WRITE to one of these is still an
 * unmodeled mutation and must trip assertNoUnhandledAppDataMutations, never be
 * silently served. `entries` syncs through the `view_authenticated_entry_results`
 * view, NOT the base table. See docs/plan-phase4-seam-render-only.md.
 */
export const SYNC_READ_TABLES = new Set([
  'shows',
  'trials',
  'classes',
  'view_authenticated_entry_results',
]);

export const CONTINUE: SeamResponse = {
  action: 'continue',
  status: 0,
  body: null,
  contentType: JSON_CT,
};

export function clock(options?: HandleOptions): Date {
  return options?.now ? options.now() : new Date();
}

/** Classify a Supabase URL into a routing target. */
export function classifyUrl(url: string): {
  kind: 'rest' | 'rpc' | 'function' | 'auth' | 'other';
  name: string | null;
} {
  let path: string;
  try {
    path = new URL(url, 'http://local.test').pathname;
  } catch {
    path = url;
  }
  if (path.includes('/auth/')) return { kind: 'auth', name: null };
  const rpc = path.match(/\/rest\/v1\/rpc\/([^/?]+)/);
  if (rpc) return { kind: 'rpc', name: rpc[1] };
  const fn = path.match(/\/functions\/v1\/([^/?]+)/);
  if (fn) return { kind: 'function', name: fn[1] };
  const rest = path.match(/\/rest\/v1\/([^/?]+)/);
  if (rest) return { kind: 'rest', name: rest[1] };
  return { kind: 'other', name: null };
}

/** Extract a PostgREST `column=eq.<value>` filter from the query string. */
export function extractEqFilter(url: string, column: string): string | null {
  let search: string;
  try {
    search = new URL(url, 'http://local.test').search;
  } catch {
    const idx = url.indexOf('?');
    search = idx >= 0 ? url.slice(idx) : '';
  }
  const params = new URLSearchParams(search);
  const raw = params.get(column);
  if (!raw) return null;
  return raw.startsWith('eq.') ? raw.slice(3) : raw;
}

/**
 * Extract a PostgREST `column=gt.<value>` filter (the replication sync watermark
 * `updated_at=gt.<iso>`). Returns the raw value (ISO string) or null when absent
 * — a full sync (`since=0`) omits the filter, so null means "return everything".
 */
export function extractGtFilter(url: string, column: string): string | null {
  let search: string;
  try {
    search = new URL(url, 'http://local.test').search;
  } catch {
    const idx = url.indexOf('?');
    search = idx >= 0 ? url.slice(idx) : '';
  }
  const params = new URLSearchParams(search);
  const raw = params.get(column);
  if (!raw) return null;
  return raw.startsWith('gt.') ? raw.slice(3) : null;
}

function wantsSingleObject(req: SeamRequest): boolean {
  const accept = req.headers?.['accept'] ?? '';
  return accept.includes('vnd.pgrst.object');
}

export function fulfilled(status: number, body: unknown, contentType = JSON_CT): SeamResponse {
  return { action: 'fulfill', status, body, contentType };
}

export function error(status: number, message: string): SeamResponse {
  return fulfilled(status, { error: message });
}

/**
 * PostgREST `.single()` semantics: a request with the object accept header that
 * matches 0 (or >1) rows returns HTTP 406 with a PGRST116 error, which
 * supabase-js surfaces as `{ data: null, error }`. App code that branches on a
 * falsy `data` (getOrCreateThread) or throws on the error (approveScratchRequest)
 * depends on this exact shape — returning `200 []` would be truthy and break it.
 */
export function pgrstNoRow(): SeamResponse {
  return fulfilled(406, {
    code: 'PGRST116',
    details: 'The result contains 0 rows',
    hint: null,
    message: 'JSON object requested, multiple (or no) rows returned',
  });
}

/** No-row result honoring `.single()` (406) vs a plain list read (`200 []`). */
export function noRow(req: SeamRequest): SeamResponse {
  return wantsSingleObject(req) ? pgrstNoRow() : fulfilled(200, []);
}

export function singleOrArray(req: SeamRequest, row: unknown, status = 200): SeamResponse {
  if (wantsSingleObject(req)) {
    if (Array.isArray(row)) {
      return row.length === 1 ? fulfilled(status, row[0]) : pgrstNoRow();
    }
    return row == null ? pgrstNoRow() : fulfilled(status, row);
  }
  return fulfilled(status, Array.isArray(row) ? row : [row]);
}

export function asObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return value.length > 0 && typeof value[0] === 'object' && value[0] !== null
      ? (value[0] as Record<string, unknown>)
      : null;
  }
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}
