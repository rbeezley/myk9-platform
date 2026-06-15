/**
 * Phase 4 cross-role seam route interceptors (write-safe).
 *
 * Serves fixture-backed responses for the five Phase 4 seams and — critically —
 * captures every fixture-related write in memory so NOTHING reaches the shared
 * Supabase project. The pure request handler (`handleSeamRequest`) is split out
 * from the Playwright wiring (`installPhase4SeamRoutes`) so the state machine
 * and the write-safety guarantees are fully unit-testable without a browser.
 *
 * Only `import type` is taken from `@playwright/test`, so this module also loads
 * cleanly under vitest (the type import is erased at transform time).
 *
 * ---------------------------------------------------------------------------
 * DATA PATH INVENTORY (verified against app source 2026-06-15)
 * ---------------------------------------------------------------------------
 * Seam 1 — scratch/pull:
 *   exhibitor request  PATCH /rest/v1/entries?id=eq.<id>
 *                      body { entry_status:'scratch-requested', special_requests }
 *                      services/database/entries/lifecycle.ts requestScratch()
 *   secretary approve  PATCH /rest/v1/entries?id=eq.<id>&entry_status=eq.scratch-requested
 *                      body { entry_status:'scratched', check_in_status:'pulled' }
 *                      lifecycle.ts approveScratchRequest()  (replication-backed READ)
 * Seam 2 — waitlist:
 *   secretary offer    PATCH /rest/v1/waitlist_entries?id=eq.<id>
 *                      body { status:'offered', offered_at, offer_expires_at }
 *                      services/database/waitlists/reads.ts offerWaitlistSpot()
 *   exhibitor accept   POST /rest/v1/entries (insert confirmed) + PATCH waitlist
 *                      reads.ts acceptWaitlistOffer()           (replication-backed READ)
 * Seam 3 — entry question (direct PostgREST READ + WRITE, realtime):
 *   thread create      POST /rest/v1/show_message_threads { show_id, participant_id }
 *   message send/reply POST /rest/v1/show_messages { show_id, thread_id, sender_id, body }
 *   mark read          PATCH /rest/v1/show_messages?... { read_at }
 *                      store/messageStore.ts
 * Seam 4 — withdrawal/refund:
 *   secretary refund   POST /functions/v1/stripe-refund-entry
 *                      body { entry_id, amount_cents, notes }
 *                      components/entries/management/RefundEntryDialog.tsx
 *                      (entry/enrollment payment_status READ replication + PostgREST)
 * Seam 5 — results release:
 *   secretary release  PATCH /rest/v1/classes?id=eq.<id>
 *                      body { results_released_at, results_released_by }
 *                      hooks/mutations/useReleaseResults.ts (replication queue)
 *   exhibitor read     GET /rest/v1/view_entry_with_results (gated by released_at)
 *                      hooks/queries/useShowResults.ts
 * ---------------------------------------------------------------------------
 */

import type { Page, Route } from '@playwright/test';
import {
  PHASE4_IDS,
  type FixtureEntry,
  type FixtureMessage,
  type FixtureMessageThread,
  type Phase4SeamState,
} from './phase4SeamFixture';

export type SeamName =
  | 'scratch'
  | 'waitlist'
  | 'message'
  | 'refund'
  | 'results'
  | 'read';

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
}

const JSON_CT = 'application/json';
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const FIXTURE_TABLES = new Set([
  'entries',
  'enrollments',
  'waitlist_entries',
  'show_messages',
  'show_message_threads',
  'classes',
  'view_entry_with_results',
]);
const FIXTURE_FUNCTIONS = new Set(['stripe-refund-entry']);

function clock(options?: HandleOptions): Date {
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

function wantsSingleObject(req: SeamRequest): boolean {
  const accept = req.headers?.['accept'] ?? '';
  return accept.includes('vnd.pgrst.object');
}

function fulfilled(
  status: number,
  body: unknown,
  contentType = JSON_CT
): SeamResponse {
  return { action: 'fulfill', status, body, contentType };
}

function error(status: number, message: string): SeamResponse {
  return fulfilled(status, { error: message });
}

const CONTINUE: SeamResponse = {
  action: 'continue',
  status: 0,
  body: null,
  contentType: JSON_CT,
};

/**
 * Pure request handler. Mutates `state` in place for fixture writes and returns
 * the response the interceptor should send plus an audit record. GET requests
 * for fixture-owned reads are served from state; everything else continues.
 */
export function handleSeamRequest(
  state: Phase4SeamState,
  req: SeamRequest,
  options?: HandleOptions
): { response: SeamResponse; audit: AuditEntry } {
  const start = clock(options).getTime();
  const { kind, name } = classifyUrl(req.url);
  const isWrite = WRITE_METHODS.has(req.method.toUpperCase());

  // Auth/session traffic always passes through untouched.
  if (kind === 'auth') {
    return record(req, name, CONTINUE, null, false, false, start, options);
  }

  const isFixtureFn = kind === 'function' && name !== null && FIXTURE_FUNCTIONS.has(name);
  const isFixtureTable = kind === 'rest' && name !== null && FIXTURE_TABLES.has(name);

  // --- WRITES -------------------------------------------------------------
  if (isWrite || isFixtureFn) {
    if (isFixtureFn) {
      const resp = handleRefundFunction(state, req, options);
      return record(req, name, resp.response, resp.seam, true, false, start, options);
    }
    if (isFixtureTable) {
      const resp = handleFixtureWrite(state, name as string, req, options);
      return record(req, name, resp.response, resp.seam, true, false, start, options);
    }
    // A non-auth, non-fixture app-data mutation. NEVER pass it through — that
    // would risk a shared-Supabase write. Block with 500 and flag it so
    // assertNoUnhandledAppDataMutations fails the test loudly.
    const allowed = (options?.allowWritePaths ?? []).some(re => re.test(req.url));
    if (allowed) {
      return record(req, name, CONTINUE, null, false, false, start, options);
    }
    return record(
      req,
      name,
      error(500, `Blocked unhandled app-data mutation: ${req.method} ${req.url}`),
      null,
      false,
      true,
      start,
      options
    );
  }

  // --- READS --------------------------------------------------------------
  if (isFixtureTable) {
    const resp = handleFixtureRead(state, name as string, req);
    if (resp) {
      return record(req, name, resp.response, resp.seam, false, false, start, options);
    }
  }
  return record(req, name, CONTINUE, null, false, false, start, options);
}

function record(
  req: SeamRequest,
  table: string | null,
  response: SeamResponse,
  seam: SeamName | null,
  isFixtureWrite: boolean,
  isUnhandledMutation: boolean,
  start: number,
  options?: HandleOptions
): { response: SeamResponse; audit: AuditEntry } {
  const elapsedMs = Math.max(0, clock(options).getTime() - start);
  return {
    response,
    audit: {
      method: req.method.toUpperCase(),
      url: req.url,
      table,
      payload: req.postData ?? null,
      fulfilled: response.action === 'fulfill',
      status: response.status,
      seam,
      isFixtureWrite,
      isUnhandledMutation,
      elapsedMs,
    },
  };
}

// --- Seam write handlers --------------------------------------------------

function handleFixtureWrite(
  state: Phase4SeamState,
  table: string,
  req: SeamRequest,
  options?: HandleOptions
): { response: SeamResponse; seam: SeamName } {
  switch (table) {
    case 'entries':
      return handleEntriesWrite(state, req, options);
    case 'waitlist_entries':
      return { ...handleWaitlistWrite(state, req, options), seam: 'waitlist' };
    case 'show_message_threads':
      return { ...handleThreadWrite(state, req, options), seam: 'message' };
    case 'show_messages':
      return { ...handleMessageWrite(state, req, options), seam: 'message' };
    case 'classes':
      return { ...handleClassesWrite(state, req, options), seam: 'results' };
    case 'enrollments':
      return { ...handleEnrollmentWrite(state, req), seam: 'refund' };
    default:
      return { response: error(500, `No write handler for ${table}`), seam: 'read' };
  }
}

function handleEntriesWrite(
  state: Phase4SeamState,
  req: SeamRequest,
  options?: HandleOptions
): { response: SeamResponse; seam: SeamName } {
  // INSERT (waitlist acceptance) has no id filter and an array/object body.
  if (req.method.toUpperCase() === 'POST') {
    const body = asObject(req.postData);
    if (!body || typeof body.class_id !== 'string' || typeof body.dog_id !== 'string') {
      return { response: error(500, 'Malformed entries insert payload'), seam: 'waitlist' };
    }
    const id = `phase4-entry-accepted-${++state.sequence}`;
    state.entries[id] = {
      id,
      show_id: state.show.id,
      trial_id: typeof body.trial_id === 'string' ? body.trial_id : PHASE4_IDS.trial,
      class_id: body.class_id,
      dog_id: body.dog_id,
      handler_id: typeof body.handler_id === 'string' ? body.handler_id : PHASE4_IDS.personA,
      exhibitor_user_id: PHASE4_IDS.exhibitorA,
      enrollment_id: null,
      entry_status: 'confirmed',
      check_in_status: 'not-checked-in',
      payment_status: 'pending',
      entry_fee: typeof body.entry_fee === 'number' ? body.entry_fee : 30,
      handler: state.users.exhibitorA.name,
      armband: null,
      special_requests: null,
      is_scored: false,
      final_placement: null,
      updated_at: clock(options).toISOString(),
    };
    // acceptWaitlistOffer inserts with `.select().single()` -> 201 single object.
    return { response: singleOrArray(req, state.entries[id], 201), seam: 'waitlist' };
  }

  // PATCH (scratch request / approve)
  const id = extractEqFilter(req.url, 'id');
  if (!id || !state.entries[id]) {
    return { response: error(500, `Unexpected entries PATCH target: ${id}`), seam: 'scratch' };
  }
  const body = asObject(req.postData);
  if (!body) {
    return { response: error(500, 'Malformed entries PATCH payload'), seam: 'scratch' };
  }
  const entry = state.entries[id];

  // Secretary approve is guarded by entry_status=eq.scratch-requested in the URL
  // and reads back with `.single()`. A guard miss returns zero rows, which under
  // `.single()` is a PGRST116 error (data:null) — approveScratchRequest THROWS
  // on it, so the race-loser sees an error, not a silent success.
  const guard = extractEqFilter(req.url, 'entry_status');
  if (guard && entry.entry_status !== guard) {
    return { response: noRow(req), seam: 'scratch' };
  }

  if (body.entry_status === 'scratch-requested') {
    entry.entry_status = 'scratch-requested';
    entry.special_requests =
      typeof body.special_requests === 'string' ? body.special_requests : null;
    entry.updated_at = clock(options).toISOString();
    return { response: singleOrArray(req, entry), seam: 'scratch' };
  }
  if (body.entry_status === 'scratched') {
    entry.entry_status = 'scratched';
    entry.check_in_status = 'pulled';
    entry.updated_at = clock(options).toISOString();
    return { response: singleOrArray(req, entry), seam: 'scratch' };
  }
  if (body.entry_status === 'withdrawn') {
    entry.entry_status = 'withdrawn';
    entry.updated_at = clock(options).toISOString();
    return { response: singleOrArray(req, entry), seam: 'refund' };
  }
  // Other entry field updates (e.g. check-in) — apply known fields safely.
  applyKnownEntryFields(entry, body);
  entry.updated_at = clock(options).toISOString();
  return { response: singleOrArray(req, entry), seam: 'scratch' };
}

function handleWaitlistWrite(
  state: Phase4SeamState,
  req: SeamRequest,
  options?: HandleOptions
): { response: SeamResponse } {
  const id = extractEqFilter(req.url, 'id');
  if (!id || !state.waitlistEntries[id]) {
    return { response: error(500, `Unexpected waitlist target: ${id}`) };
  }

  // Acceptance: acceptWaitlistOffer DELETEs the waitlist row after inserting the
  // confirmed entry (it does NOT PATCH status='accepted'). PostgREST delete
  // without a returning clause -> 204 No Content.
  if (req.method.toUpperCase() === 'DELETE') {
    delete state.waitlistEntries[id];
    return { response: { action: 'fulfill', status: 204, body: '', contentType: JSON_CT } };
  }

  const body = asObject(req.postData);
  if (!body || typeof body.status !== 'string') {
    return { response: error(500, 'Malformed waitlist PATCH payload') };
  }
  const row = state.waitlistEntries[id];
  // offerWaitlistSpot is the only fixture PATCH: 'waiting' -> 'offered'.
  if (body.status === 'offered') {
    row.status = 'offered';
    row.offered_at =
      typeof body.offered_at === 'string' ? body.offered_at : clock(options).toISOString();
    row.offer_expires_at =
      typeof body.offer_expires_at === 'string' ? body.offer_expires_at : null;
  } else if (body.status === 'declined' || body.status === 'expired') {
    row.status = body.status;
  } else {
    return { response: error(500, `Unsupported waitlist status: ${body.status}`) };
  }
  row.updated_at = clock(options).toISOString();
  return { response: singleOrArray(req, row) };
}

function handleThreadWrite(
  state: Phase4SeamState,
  req: SeamRequest,
  options?: HandleOptions
): { response: SeamResponse } {
  const body = asObject(req.postData);
  if (!body || typeof body.show_id !== 'string' || typeof body.participant_id !== 'string') {
    return { response: error(500, 'Malformed thread insert payload') };
  }
  // getOrCreateThread: reuse an existing thread for the same participant.
  const existing = Object.values(state.threads).find(
    t => t.show_id === body.show_id && t.participant_id === body.participant_id
  );
  if (existing) {
    return { response: singleOrArray(req, existing) };
  }
  const id = `phase4-thread-${++state.sequence}`;
  const thread: FixtureMessageThread = {
    id,
    show_id: body.show_id,
    participant_id: body.participant_id,
    last_message_at: null,
    created_at: clock(options).toISOString(),
  };
  state.threads[id] = thread;
  return { response: singleOrArray(req, thread) };
}

function handleMessageWrite(
  state: Phase4SeamState,
  req: SeamRequest,
  options?: HandleOptions
): { response: SeamResponse } {
  // PATCH = mark read
  if (req.method.toUpperCase() === 'PATCH') {
    const threadId = extractEqFilter(req.url, 'thread_id');
    const body = asObject(req.postData);
    const readAt =
      body && typeof body.read_at === 'string' ? body.read_at : clock(options).toISOString();
    let touched = 0;
    for (const m of state.messages) {
      if ((!threadId || m.thread_id === threadId) && m.read_at === null) {
        m.read_at = readAt;
        touched++;
      }
    }
    return { response: fulfilled(200, { touched }) };
  }

  // POST = send / reply
  const body = asObject(req.postData);
  if (
    !body ||
    typeof body.show_id !== 'string' ||
    typeof body.thread_id !== 'string' ||
    typeof body.sender_id !== 'string' ||
    typeof body.body !== 'string'
  ) {
    return { response: error(500, 'Malformed show_messages insert payload') };
  }
  const id = `phase4-message-${++state.sequence}`;
  const createdAt = clock(options).toISOString();
  const message: FixtureMessage = {
    id,
    show_id: body.show_id,
    thread_id: body.thread_id,
    sender_id: body.sender_id,
    body: body.body,
    group_label: typeof body.group_label === 'string' ? body.group_label : null,
    read_at: null,
    created_at: createdAt,
  };
  state.messages.push(message);
  const thread = state.threads[body.thread_id];
  if (thread) thread.last_message_at = createdAt;
  return { response: singleOrArray(req, message) };
}

function handleClassesWrite(
  state: Phase4SeamState,
  req: SeamRequest,
  options?: HandleOptions
): { response: SeamResponse } {
  const id = extractEqFilter(req.url, 'id');
  if (!id || !state.classes[id]) {
    return { response: error(500, `Unexpected classes PATCH target: ${id}`) };
  }
  const body = asObject(req.postData);
  if (!body) return { response: error(500, 'Malformed classes PATCH payload') };
  const cls = state.classes[id];
  const releasedAt = body.results_released_at ?? body.resultsReleasedAt;
  if (releasedAt !== undefined) {
    cls.results_released_at = releasedAt === null ? null : String(releasedAt);
    const by = body.results_released_by ?? body.resultsReleasedBy;
    cls.results_released_by = by == null ? null : String(by);
    // Reveal the seeded scored entry's result for this class.
    for (const entry of Object.values(state.entries)) {
      if (entry.class_id === id && entry.is_scored) {
        entry.updated_at = clock(options).toISOString();
      }
    }
  }
  return { response: singleOrArray(req, cls) };
}

function handleEnrollmentWrite(
  state: Phase4SeamState,
  req: SeamRequest
): { response: SeamResponse } {
  const id = extractEqFilter(req.url, 'id');
  if (!id || !state.enrollments[id]) {
    return { response: error(500, `Unexpected enrollments PATCH target: ${id}`) };
  }
  const body = asObject(req.postData);
  if (!body) return { response: error(500, 'Malformed enrollments PATCH payload') };
  const row = state.enrollments[id];
  if (typeof body.payment_status === 'string') {
    row.payment_status = body.payment_status as typeof row.payment_status;
  }
  if (typeof body.refund_amount === 'number') row.refund_amount = body.refund_amount;
  if (typeof body.refund_status === 'string') {
    row.refund_status = body.refund_status as typeof row.refund_status;
  }
  if (typeof body.refunded_at === 'string') row.refunded_at = body.refunded_at;
  return { response: singleOrArray(req, row) };
}

function handleRefundFunction(
  state: Phase4SeamState,
  req: SeamRequest,
  options?: HandleOptions
): { response: SeamResponse; seam: SeamName } {
  const body = asObject(req.postData);
  if (!body || typeof body.entry_id !== 'string') {
    return { response: error(500, 'Malformed refund payload'), seam: 'refund' };
  }
  const entry = state.entries[body.entry_id];
  if (!entry) {
    return { response: error(500, `Refund target not found: ${body.entry_id}`), seam: 'refund' };
  }
  const fullCents = Math.round(entry.entry_fee * 100);
  const requested = typeof body.amount_cents === 'number' ? body.amount_cents : fullCents;
  const amountCents = Math.min(Math.max(0, requested), fullCents);
  const refundedAt = clock(options).toISOString();
  const isFull = amountCents >= fullCents;

  entry.payment_status = isFull ? 'refunded' : 'partial-refund';
  entry.entry_status = 'withdrawn';
  entry.updated_at = refundedAt;

  if (entry.enrollment_id && state.enrollments[entry.enrollment_id]) {
    const enr = state.enrollments[entry.enrollment_id];
    enr.payment_status = isFull ? 'refunded' : 'partial-refund';
    enr.refund_amount = amountCents / 100;
    enr.refund_status = 'processed';
    enr.refunded_at = refundedAt;
  }
  return { response: fulfilled(200, { amount_cents: amountCents }), seam: 'refund' };
}

// --- Seam read handlers (state-derived) -----------------------------------

function handleFixtureRead(
  state: Phase4SeamState,
  table: string,
  req: SeamRequest
): { response: SeamResponse; seam: SeamName } | null {
  switch (table) {
    case 'show_message_threads': {
      // getOrCreateThread reads with `.single()`: no row -> PGRST116/data:null so
      // the app proceeds to INSERT. singleOrArray maps an empty list to that.
      const showId = extractEqFilter(req.url, 'show_id');
      const participant = extractEqFilter(req.url, 'participant_id');
      const rows = Object.values(state.threads).filter(
        t =>
          (!showId || t.show_id === showId) &&
          (!participant || t.participant_id === participant)
      );
      return { response: singleOrArray(req, rows), seam: 'message' };
    }
    case 'show_messages': {
      const threadId = extractEqFilter(req.url, 'thread_id');
      const showId = extractEqFilter(req.url, 'show_id');
      const rows = state.messages.filter(
        m => (!threadId || m.thread_id === threadId) && (!showId || m.show_id === showId)
      );
      return { response: fulfilled(200, rows), seam: 'message' };
    }
    case 'view_entry_with_results': {
      // Exhibitor results view is gated: only released classes are visible.
      const showId = extractEqFilter(req.url, 'show_id');
      const rows = Object.values(state.entries)
        .filter(e => e.is_scored && (!showId || e.show_id === showId))
        .filter(e => state.classes[e.class_id]?.results_released_at != null)
        .map(e => resultViewRow(state, e));
      return { response: fulfilled(200, rows), seam: 'results' };
    }
    case 'waitlist_entries': {
      // Serves both the class roster (array) and acceptWaitlistOffer's guarded
      // `.eq('id').eq('status','offered').single()` fetch (single object / 406).
      const id = extractEqFilter(req.url, 'id');
      const showId = extractEqFilter(req.url, 'show_id');
      const classId = extractEqFilter(req.url, 'class_id');
      const status = extractEqFilter(req.url, 'status');
      const rows = Object.values(state.waitlistEntries).filter(
        w =>
          (!id || w.id === id) &&
          (!showId || w.show_id === showId) &&
          (!classId || w.class_id === classId) &&
          (!status || w.status === status)
      );
      return { response: singleOrArray(req, rows), seam: 'waitlist' };
    }
    default:
      // entries/enrollments/classes reads are replication-backed in the app;
      // let them continue rather than racing the IndexedDB layer.
      return null;
  }
}

function resultViewRow(state: Phase4SeamState, entry: FixtureEntry) {
  const cls = state.classes[entry.class_id];
  const dog = state.dogs[entry.dog_id];
  return {
    entry_id: entry.id,
    show_id: entry.show_id,
    class_id: entry.class_id,
    class_name: cls?.name ?? null,
    class_results_released_at: cls?.results_released_at ?? null,
    final_placement: entry.final_placement,
    is_scored: true,
    handler: entry.handler,
    dog_call_name: dog?.call_name ?? null,
    armband: entry.armband,
  };
}

// --- Assertions -----------------------------------------------------------

/**
 * Fails if any fixture write was continued to the network instead of being
 * fulfilled locally — the core shared-Supabase safety guarantee.
 */
export function assertNoSharedWrites(audit: AuditEntry[]): void {
  const leaked = audit.filter(a => a.isFixtureWrite && !a.fulfilled);
  if (leaked.length > 0) {
    const detail = leaked.map(a => `${a.method} ${a.url}`).join('\n  ');
    throw new Error(
      `assertNoSharedWrites: ${leaked.length} fixture write(s) reached the network:\n  ${detail}`
    );
  }
}

/**
 * Fails if any non-auth app-data mutation was neither fulfilled locally nor
 * explicitly allowed — catches a seam touching an endpoint we did not model.
 */
export function assertNoUnhandledAppDataMutations(audit: AuditEntry[]): void {
  const unhandled = audit.filter(a => a.isUnhandledMutation);
  if (unhandled.length > 0) {
    const detail = unhandled.map(a => `${a.method} ${a.url}`).join('\n  ');
    throw new Error(
      `assertNoUnhandledAppDataMutations: ${unhandled.length} unmodeled mutation(s):\n  ${detail}`
    );
  }
}

// --- Helpers --------------------------------------------------------------

function asObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return value.length > 0 && typeof value[0] === 'object' && value[0] !== null
      ? (value[0] as Record<string, unknown>)
      : null;
  }
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function applyKnownEntryFields(
  entry: Phase4SeamState['entries'][string],
  body: Record<string, unknown>
): void {
  if (typeof body.check_in_status === 'string') {
    entry.check_in_status = body.check_in_status as typeof entry.check_in_status;
  }
  if (typeof body.armband === 'number') entry.armband = body.armband;
  if (typeof body.payment_status === 'string') {
    entry.payment_status = body.payment_status as typeof entry.payment_status;
  }
}

/**
 * PostgREST `.single()` semantics: a request with the object accept header that
 * matches 0 (or >1) rows returns HTTP 406 with a PGRST116 error, which
 * supabase-js surfaces as `{ data: null, error }`. App code that branches on a
 * falsy `data` (getOrCreateThread) or throws on the error (approveScratchRequest)
 * depends on this exact shape — returning `200 []` would be truthy and break it.
 */
function pgrstNoRow(): SeamResponse {
  return fulfilled(406, {
    code: 'PGRST116',
    details: 'The result contains 0 rows',
    hint: null,
    message: 'JSON object requested, multiple (or no) rows returned',
  });
}

/** No-row result honoring `.single()` (406) vs a plain list read (`200 []`). */
function noRow(req: SeamRequest): SeamResponse {
  return wantsSingleObject(req) ? pgrstNoRow() : fulfilled(200, []);
}

function singleOrArray(req: SeamRequest, row: unknown, status = 200): SeamResponse {
  if (wantsSingleObject(req)) {
    if (Array.isArray(row)) {
      return row.length === 1 ? fulfilled(status, row[0]) : pgrstNoRow();
    }
    return row == null ? pgrstNoRow() : fulfilled(status, row);
  }
  return fulfilled(status, Array.isArray(row) ? row : [row]);
}

// --- Playwright wiring ----------------------------------------------------

export interface InstalledSeamRoutes {
  /** Chronological audit of every intercepted request. */
  audit: AuditEntry[];
  /** Convenience: throws if any fixture write leaked to the network. */
  assertSafe: () => void;
}

/**
 * Install the seam interceptors on a Playwright page. Both browser contexts in
 * a two-context spec must share the SAME `state` instance so the secretary and
 * exhibitor observe the same in-memory show.
 */
export async function installPhase4SeamRoutes(
  page: Page,
  state: Phase4SeamState,
  options?: HandleOptions
): Promise<InstalledSeamRoutes> {
  const audit: AuditEntry[] = [];

  const handler = async (route: Route): Promise<void> => {
    const request = route.request();
    let postData: unknown = null;
    try {
      postData = request.postDataJSON();
    } catch {
      postData = request.postData() ?? null;
    }
    const headers = lowercaseHeaders(request.headers());
    const { response, audit: entry } = handleSeamRequest(
      state,
      { method: request.method(), url: request.url(), postData, headers },
      options
    );
    audit.push(entry);
    if (response.action === 'continue') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: response.status,
      contentType: response.contentType,
      body: typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
    });
  };

  await page.route('**/rest/v1/**', handler);
  await page.route('**/functions/v1/**', handler);

  return {
    audit,
    assertSafe: () => {
      assertNoSharedWrites(audit);
      assertNoUnhandledAppDataMutations(audit);
    },
  };
}

function lowercaseHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v;
  return out;
}
