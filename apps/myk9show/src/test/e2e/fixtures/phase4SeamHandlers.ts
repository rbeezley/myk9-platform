/**
 * Phase 4 seam handlers — per-seam state transitions (write-safe).
 *
 * Each handler fulfils a seam's reads/writes against the in-memory fixture state
 * and NEVER lets a fixture mutation reach the network. The dispatcher in
 * `phase4SeamRoutes.ts` wires these to the request flow.
 *
 * ---------------------------------------------------------------------------
 * DATA PATH INVENTORY (verified against app source 2026-06-15)
 * ---------------------------------------------------------------------------
 * Seam 1 — scratch/pull:
 *   request  PATCH /rest/v1/entries?id=eq.<id> { entry_status:'scratch-requested' }
 *   approve  PATCH /rest/v1/entries?id=eq.<id>&entry_status=eq.scratch-requested
 *            { entry_status:'scratched', check_in_status:'pulled' }  (`.single()`)
 *            services/database/entries/lifecycle.ts
 * Seam 2 — waitlist:
 *   promote  POST /rest/v1/rpc/promote_waitlist_entry
 *            -> creates entries.entry_status='pending-payment' and keeps row offered
 *            services/database/waitlists/reads.ts
 * Seam 3 — entry question:
 *   thread   GET/POST /rest/v1/show_message_threads (getOrCreateThread `.single()`)
 *   message  POST /rest/v1/show_messages ; PATCH ...{ read_at } ; store/messageStore.ts
 * Seam 4 — withdrawal/refund:
 *   refund   POST /functions/v1/stripe-refund-entry { entry_id, amount_cents }
 *            components/entries/management/RefundEntryDialog.tsx
 * Seam 5 — results release:
 *   release  PATCH /rest/v1/classes?id=eq.<id> { results_released_at }
 *   read     GET /rest/v1/view_entry_with_results (gated by released_at)
 * ---------------------------------------------------------------------------
 */

import {
  PHASE4_IDS,
  type FixtureClass,
  type FixtureDog,
  type FixtureEntry,
  type FixtureMessage,
  type FixtureMessageThread,
  type Phase4SeamState,
} from './phase4SeamFixture';
import {
  asObject,
  clock,
  error,
  extractEqFilter,
  extractGtFilter,
  fulfilled,
  noRow,
  singleOrArray,
  type HandleOptions,
  type SeamName,
  type SeamRequest,
  type SeamResponse,
} from './phase4SeamHttp';

/**
 * Synthetic last-sync timestamp for rows the fixture doesn't otherwise version
 * (show/trial/class). Newer than the entry SEED_TS so a watermarked incremental
 * sync still surfaces the show scaffold; on a full sync (no `gt` filter) it is
 * returned unconditionally.
 */
const SYNC_UPDATED_AT = '2026-06-06T00:00:00.000Z';

// --- Write dispatch -------------------------------------------------------

export function handleFixtureWrite(
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

export function handleFixtureRpc(
  state: Phase4SeamState,
  name: string,
  req: SeamRequest,
  options?: HandleOptions
): { response: SeamResponse; seam: SeamName } {
  if (name !== 'promote_waitlist_entry') {
    return { response: error(500, `No RPC handler for ${name}`), seam: 'read' };
  }

  const body = asObject(req.postData);
  const waitlistEntryId =
    typeof body?.p_waitlist_entry_id === 'string' ? body.p_waitlist_entry_id : null;
  const deadlineHours = typeof body?.p_deadline_hours === 'number' ? body.p_deadline_hours : 48;

  if (!waitlistEntryId || !state.waitlistEntries[waitlistEntryId]) {
    return {
      response: error(500, `Unexpected waitlist promotion target: ${waitlistEntryId}`),
      seam: 'waitlist',
    };
  }

  const row = state.waitlistEntries[waitlistEntryId];
  if (row.status !== 'waiting') {
    return {
      response: error(400, 'Waitlist entry is not available for promotion'),
      seam: 'waitlist',
    };
  }

  const now = clock(options);
  const promotedEntryId = `phase4-entry-promoted-${++state.sequence}`;
  row.status = 'offered';
  row.offered_at = now.toISOString();
  row.offer_expires_at = new Date(now.getTime() + deadlineHours * 60 * 60 * 1000).toISOString();
  row.promoted_entry_id = promotedEntryId;
  row.updated_at = now.toISOString();

  const cls = state.classes[row.class_id];
  state.entries[promotedEntryId] = {
    id: promotedEntryId,
    show_id: row.show_id,
    trial_id: cls?.trial_id ?? PHASE4_IDS.trial,
    class_id: row.class_id,
    dog_id: row.dog_id,
    handler_id: row.handler_id,
    exhibitor_user_id: row.exhibitor_user_id,
    enrollment_id: null,
    entry_status: 'pending-payment',
    check_in_status: 'not-checked-in',
    payment_status: 'pending',
    entry_fee: cls?.entry_fee ?? 30,
    handler: state.users.exhibitorA.name,
    armband: null,
    special_requests: null,
    is_scored: false,
    final_placement: null,
    updated_at: row.updated_at,
  };

  return { response: fulfilled(200, promotedEntryId), seam: 'waitlist' };
}

function handleEntriesWrite(
  state: Phase4SeamState,
  req: SeamRequest,
  options?: HandleOptions
): { response: SeamResponse; seam: SeamName } {
  // INSERT has no id filter and an array/object body.
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

  // Waitlist promotion is handled by the promote_waitlist_entry RPC. Deleting
  // the row here would reintroduce the retired grant-then-collect path.
  if (req.method.toUpperCase() === 'DELETE') {
    return { response: error(500, 'Waitlist DELETE is not part of the pay-to-claim fixture') };
  }

  const body = asObject(req.postData);
  if (!body || typeof body.status !== 'string') {
    return { response: error(500, 'Malformed waitlist PATCH payload') };
  }
  const row = state.waitlistEntries[id];
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

export function handleRefundFunction(
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

// --- Reads (state-derived) ------------------------------------------------

export function handleFixtureRead(
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
        t => (!showId || t.show_id === showId) && (!participant || t.participant_id === participant)
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
      // Serves the waitlist roster and direct row reads.
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

// --- Replication sync-down reads (render-only) ----------------------------

/**
 * Serves the replication sync-down GETs (shows / trials / classes / entries-view)
 * from fixture state so the app's own sync writes the fixture show into IndexedDB
 * and renders it — the render-only read strategy
 * (docs/plan-phase4-seam-render-only.md). Honors the PostgREST `eq` scope filter
 * and the `updated_at=gt.<iso>` watermark; a full sync omits the watermark, so a
 * null `since` returns everything. Returns null for an unrecognized table so the
 * dispatcher continues the request to the network.
 */
export function handleSyncRead(
  state: Phase4SeamState,
  table: string,
  req: SeamRequest,
  options?: HandleOptions
): { response: SeamResponse; seam: SeamName } | null {
  const since = extractGtFilter(req.url, 'updated_at');
  const fresh = (updatedAt: string): boolean => since === null || updatedAt > since;

  switch (table) {
    case 'shows': {
      const id = extractEqFilter(req.url, 'id');
      const clubId = extractEqFilter(req.url, 'club_id');
      const match =
        (!id || id === state.show.id) &&
        (!clubId || clubId === state.show.club_id) &&
        fresh(SYNC_UPDATED_AT);
      return { response: fulfilled(200, match ? [showRow(state)] : []), seam: 'read' };
    }
    case 'trials': {
      const showId = extractEqFilter(req.url, 'show_id');
      const id = extractEqFilter(req.url, 'id');
      const match =
        (!showId || showId === state.trial.show_id) &&
        (!id || id === state.trial.id) &&
        fresh(SYNC_UPDATED_AT);
      return { response: fulfilled(200, match ? [trialRow(state)] : []), seam: 'read' };
    }
    case 'classes': {
      const trialId = extractEqFilter(req.url, 'trial_id');
      const id = extractEqFilter(req.url, 'id');
      const rows = Object.values(state.classes)
        .filter(c => (!trialId || c.trial_id === trialId) && (!id || c.id === id))
        .filter(() => fresh(SYNC_UPDATED_AT))
        .map(classRow);
      return { response: fulfilled(200, rows), seam: 'read' };
    }
    case 'view_authenticated_entry_results': {
      const showId = extractEqFilter(req.url, 'show_id');
      const classId = extractEqFilter(req.url, 'class_id');
      const rows = Object.values(state.entries)
        .filter(e => (!showId || e.show_id === showId) && (!classId || e.class_id === classId))
        .filter(e => fresh(e.updated_at))
        .map(e => entryViewRow(state, e, options));
      return { response: fulfilled(200, rows), seam: 'read' };
    }
    case 'show_visibility_settings':
    case 'trial_visibility_overrides':
    case 'class_visibility_overrides':
      // Empty → Results Control resolves to default visibility instead of
      // erroring on the non-UUID fixture show_id (which leaves it skeleton).
      return { response: fulfilled(200, []), seam: 'read' };
    case 'dogs': {
      // The dogs sync is owner-scoped (`owner_id=eq.<person>`) and the app
      // post-filters by owner. Echo the requested owner_id onto the fixture dogs
      // so they appear owned by whoever asks: the signed-in exhibitor's My
      // Entries ownership filter then keeps the fixture entries, and the
      // secretary's pull card resolves dog names instead of "Unknown Dog".
      const ownerId = extractEqFilter(req.url, 'owner_id');
      const id = extractEqFilter(req.url, 'id');
      const rows = Object.values(state.dogs)
        .filter(d => !id || d.id === id)
        .map(d => dogRow(d, ownerId));
      return { response: fulfilled(200, rows), seam: 'read' };
    }
    default:
      return null;
  }
}

function dogRow(dog: FixtureDog, ownerId: string | null): Record<string, unknown> {
  return {
    id: dog.id,
    name: dog.name,
    call_name: dog.call_name,
    owner_id: ownerId ?? dog.owner_person_id,
    breed: null,
    deleted_at: null,
    updated_at: SYNC_UPDATED_AT,
  };
}

function showRow(state: Phase4SeamState): Record<string, unknown> {
  const s = state.show;
  return {
    id: s.id,
    name: s.name,
    organization: s.organization,
    start_date: s.start_date,
    end_date: s.end_date,
    club_id: s.club_id,
    status: 'published',
    entry_close_date: s.entry_close_at,
    updated_at: SYNC_UPDATED_AT,
  };
}

function trialRow(state: Phase4SeamState): Record<string, unknown> {
  const t = state.trial;
  return {
    id: t.id,
    show_id: t.show_id,
    name: t.name,
    date: t.date,
    status: 'scheduled',
    updated_at: SYNC_UPDATED_AT,
  };
}

function classRow(cls: FixtureClass): Record<string, unknown> {
  return {
    id: cls.id,
    trial_id: cls.trial_id,
    name: cls.name,
    class_number: cls.class_number,
    max_entries: cls.max_entries,
    entry_fee: cls.entry_fee,
    results_released_at: cls.results_released_at,
    results_released_by: cls.results_released_by,
    status: cls.results_released_at ? 'completed' : 'scheduled',
    updated_at: SYNC_UPDATED_AT,
  };
}

function entryViewRow(
  state: Phase4SeamState,
  entry: FixtureEntry,
  options?: HandleOptions
): Record<string, unknown> {
  const isExhibitorA = entry.exhibitor_user_id === PHASE4_IDS.exhibitorA;
  const personId = options?.identity?.exhibitorPersonId;
  // Render-only ownership remap: exhibitor-A rows adopt the real signed-in
  // exhibitor's person id so client-side "my entries" filters keep them.
  const handlerId = isExhibitorA && personId ? personId : entry.handler_id;
  return {
    id: entry.id,
    show_id: entry.show_id,
    trial_id: entry.trial_id,
    class_id: entry.class_id,
    dog_id: entry.dog_id,
    handler_id: handlerId,
    handler: entry.handler,
    armband: entry.armband,
    entry_status: entry.entry_status,
    check_in_status: entry.check_in_status,
    entry_fee: entry.entry_fee,
    payment_status: entry.payment_status,
    special_requests: entry.special_requests,
    is_scored: entry.is_scored,
    final_placement: entry.final_placement,
    dog_call_name: state.dogs[entry.dog_id]?.call_name ?? null,
    updated_at: entry.updated_at,
  };
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

function applyKnownEntryFields(entry: FixtureEntry, body: Record<string, unknown>): void {
  if (typeof body.check_in_status === 'string') {
    entry.check_in_status = body.check_in_status as typeof entry.check_in_status;
  }
  if (typeof body.armband === 'number') entry.armband = body.armband;
  if (typeof body.payment_status === 'string') {
    entry.payment_status = body.payment_status as typeof entry.payment_status;
  }
}
