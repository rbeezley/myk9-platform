/**
 * Unit tests for the Phase 4 cross-role seam fixture harness.
 *
 * These run under vitest (NOT Playwright) because the pure request handler and
 * the write-safety assertions carry the safety-critical logic that proves a
 * seam end to end without a browser or the shared Supabase project. The live
 * two-context walk lives in `e2e/show/phase4CrossRoleSeams.spec.ts`.
 *
 * Located outside the e2e directory so vitest collects it (vitest excludes
 * everything under e2e; Playwright would otherwise grab a .test.ts placed
 * there).
 */

import { describe, it, expect } from 'vitest';
import {
  createPhase4SeamState,
  PHASE4_IDS,
  type Phase4SeamState,
} from '../e2e/fixtures/phase4SeamFixture';
import {
  handleSeamRequest,
  classifyUrl,
  extractEqFilter,
  assertNoSharedWrites,
  assertNoUnhandledAppDataMutations,
  type AuditEntry,
  type SeamRequest,
} from '../e2e/fixtures/phase4SeamRoutes';

const REST = 'https://x.supabase.co/rest/v1';
const FN = 'https://x.supabase.co/functions/v1';

// Deterministic clock for stable timestamps/elapsed values.
let tick = 0;
const fixedClock = () => new Date(Date.UTC(2026, 5, 15, 12, 0, 0) + tick++ * 1000);
const opts = { now: fixedClock };

/** Run a request against state, push the audit, and return the response. */
function run(state: Phase4SeamState, audit: AuditEntry[], req: SeamRequest) {
  const { response, audit: entry } = handleSeamRequest(state, req, opts);
  audit.push(entry);
  return response;
}

describe('classifyUrl', () => {
  it('classifies rest/rpc/function/auth/other', () => {
    expect(classifyUrl(`${REST}/entries?id=eq.1`)).toEqual({ kind: 'rest', name: 'entries' });
    expect(classifyUrl(`${REST}/rpc/do_thing`)).toEqual({ kind: 'rpc', name: 'do_thing' });
    expect(classifyUrl(`${FN}/stripe-refund-entry`)).toEqual({
      kind: 'function',
      name: 'stripe-refund-entry',
    });
    expect(classifyUrl('https://x.supabase.co/auth/v1/token')).toEqual({
      kind: 'auth',
      name: null,
    });
    expect(classifyUrl('https://cdn.example.com/img.png')).toEqual({ kind: 'other', name: null });
  });
});

describe('extractEqFilter', () => {
  it('reads eq filters and bare values', () => {
    expect(extractEqFilter(`${REST}/entries?id=eq.abc`, 'id')).toBe('abc');
    expect(extractEqFilter(`${REST}/entries?id=eq.abc&entry_status=eq.scratch-requested`, 'entry_status')).toBe(
      'scratch-requested'
    );
    expect(extractEqFilter(`${REST}/entries?id=eq.abc`, 'missing')).toBeNull();
  });
});

describe('Seam 1: scratch / pull request', () => {
  it('exhibitor request -> secretary sees -> secretary approve -> both agree', () => {
    const state = createPhase4SeamState();
    const audit: AuditEntry[] = [];
    const id = PHASE4_IDS.entryScratch;

    // Exhibitor requests scratch.
    const reqResp = run(state, audit, {
      method: 'PATCH',
      url: `${REST}/entries?id=eq.${id}`,
      postData: { entry_status: 'scratch-requested', special_requests: 'Dog injured' },
    });
    expect(reqResp.status).toBe(200);
    expect(state.entries[id].entry_status).toBe('scratch-requested');
    expect(state.entries[id].special_requests).toBe('Dog injured');

    // Secretary approves (guarded by entry_status=eq.scratch-requested).
    const apprResp = run(state, audit, {
      method: 'PATCH',
      url: `${REST}/entries?id=eq.${id}&entry_status=eq.scratch-requested`,
      postData: { entry_status: 'scratched', check_in_status: 'pulled' },
    });
    expect(apprResp.status).toBe(200);
    expect(state.entries[id].entry_status).toBe('scratched');
    expect(state.entries[id].check_in_status).toBe('pulled');

    assertNoSharedWrites(audit);
    assertNoUnhandledAppDataMutations(audit);
  });

  it('approve is a no-op (zero rows) when the guard no longer matches', () => {
    const state = createPhase4SeamState();
    const audit: AuditEntry[] = [];
    const id = PHASE4_IDS.entryScratch; // still 'confirmed', not 'scratch-requested'
    const resp = run(state, audit, {
      method: 'PATCH',
      url: `${REST}/entries?id=eq.${id}&entry_status=eq.scratch-requested`,
      postData: { entry_status: 'scratched', check_in_status: 'pulled' },
    });
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual([]); // PostgREST returns no rows
    expect(state.entries[id].entry_status).toBe('confirmed'); // unchanged
  });

  it('rejects a PATCH against an unknown entry id with 500', () => {
    const state = createPhase4SeamState();
    const audit: AuditEntry[] = [];
    const resp = run(state, audit, {
      method: 'PATCH',
      url: `${REST}/entries?id=eq.not-a-fixture`,
      postData: { entry_status: 'scratch-requested' },
    });
    expect(resp.status).toBe(500);
  });
});

describe('Seam 2: waitlist offer / acceptance', () => {
  it('secretary offers -> exhibitor accepts -> waitlist accepted + new confirmed entry', () => {
    const state = createPhase4SeamState();
    const audit: AuditEntry[] = [];
    const wId = PHASE4_IDS.waitlist;

    // Secretary offers the spot.
    run(state, audit, {
      method: 'PATCH',
      url: `${REST}/waitlist_entries?id=eq.${wId}`,
      postData: {
        status: 'offered',
        offered_at: '2026-06-10T10:00:00.000Z',
        offer_expires_at: '2026-06-11T10:00:00.000Z',
      },
    });
    expect(state.waitlistEntries[wId].status).toBe('offered');
    expect(state.waitlistEntries[wId].offer_expires_at).toBe('2026-06-11T10:00:00.000Z');

    // Exhibitor accepts: app inserts a confirmed entry...
    const insertResp = run(state, audit, {
      method: 'POST',
      url: `${REST}/entries`,
      postData: {
        class_id: PHASE4_IDS.classFull,
        dog_id: PHASE4_IDS.dogA,
        handler_id: PHASE4_IDS.personA,
        trial_id: PHASE4_IDS.trial,
        entry_status: 'confirmed',
        payment_status: 'pending',
        entry_fee: 30,
      },
    });
    expect(insertResp.status).toBe(201);
    const created = Object.values(state.entries).find(
      e => e.class_id === PHASE4_IDS.classFull && e.dog_id === PHASE4_IDS.dogA
    );
    expect(created?.entry_status).toBe('confirmed');

    // ...then flips the waitlist row to accepted.
    run(state, audit, {
      method: 'PATCH',
      url: `${REST}/waitlist_entries?id=eq.${wId}`,
      postData: { status: 'accepted', accepted_entry_id: created?.id },
    });
    expect(state.waitlistEntries[wId].status).toBe('accepted');
    expect(state.waitlistEntries[wId].accepted_entry_id).toBe(created?.id);

    assertNoSharedWrites(audit);
    assertNoUnhandledAppDataMutations(audit);
  });

  it('serves the seeded waitlist row on read filtered by class', () => {
    const state = createPhase4SeamState();
    const audit: AuditEntry[] = [];
    const resp = run(state, audit, {
      method: 'GET',
      url: `${REST}/waitlist_entries?class_id=eq.${PHASE4_IDS.classFull}`,
      postData: null,
    });
    expect(Array.isArray(resp.body)).toBe(true);
    expect((resp.body as unknown[]).length).toBe(1);
  });
});

describe('Seam 3: entry question (messaging)', () => {
  it('exhibitor creates thread + sends -> secretary reads -> replies -> exhibitor reads reply', () => {
    const state = createPhase4SeamState();
    const audit: AuditEntry[] = [];

    // Exhibitor get-or-create thread.
    const threadResp = run(state, audit, {
      method: 'POST',
      url: `${REST}/show_message_threads`,
      postData: { show_id: PHASE4_IDS.show, participant_id: PHASE4_IDS.exhibitorA },
      headers: { accept: 'application/vnd.pgrst.object+json' },
    });
    const thread = threadResp.body as { id: string };
    expect(thread.id).toBeTruthy();

    // Exhibitor sends a question.
    run(state, audit, {
      method: 'POST',
      url: `${REST}/show_messages`,
      postData: {
        show_id: PHASE4_IDS.show,
        thread_id: thread.id,
        sender_id: PHASE4_IDS.exhibitorA,
        body: 'What time is my class?',
      },
      headers: { accept: 'application/vnd.pgrst.object+json' },
    });

    // Secretary reads the thread's messages.
    const secretaryView = run(state, audit, {
      method: 'GET',
      url: `${REST}/show_messages?thread_id=eq.${thread.id}`,
      postData: null,
    });
    expect((secretaryView.body as unknown[]).length).toBe(1);

    // Secretary replies.
    run(state, audit, {
      method: 'POST',
      url: `${REST}/show_messages`,
      postData: {
        show_id: PHASE4_IDS.show,
        thread_id: thread.id,
        sender_id: PHASE4_IDS.secretary,
        body: 'Your class starts at 9am.',
      },
    });

    // Exhibitor sees both messages, in order, secretary reply last.
    const exhibitorView = run(state, audit, {
      method: 'GET',
      url: `${REST}/show_messages?thread_id=eq.${thread.id}`,
      postData: null,
    });
    const msgs = exhibitorView.body as Array<{ sender_id: string; body: string }>;
    expect(msgs.length).toBe(2);
    expect(msgs[1].sender_id).toBe(PHASE4_IDS.secretary);
    expect(msgs[1].body).toContain('9am');

    // get-or-create is idempotent: a second call reuses the same thread.
    const again = run(state, audit, {
      method: 'POST',
      url: `${REST}/show_message_threads`,
      postData: { show_id: PHASE4_IDS.show, participant_id: PHASE4_IDS.exhibitorA },
      headers: { accept: 'application/vnd.pgrst.object+json' },
    });
    expect((again.body as { id: string }).id).toBe(thread.id);

    assertNoSharedWrites(audit);
    assertNoUnhandledAppDataMutations(audit);
  });
});

describe('Seam 4: withdrawal / refund', () => {
  it('secretary full refund -> entry refunded/withdrawn + enrollment updated', () => {
    const state = createPhase4SeamState();
    const audit: AuditEntry[] = [];
    const id = PHASE4_IDS.entryWithdraw;

    const resp = run(state, audit, {
      method: 'POST',
      url: `${FN}/stripe-refund-entry`,
      postData: { entry_id: id, notes: 'Exhibitor withdrew' },
    });
    expect(resp.status).toBe(200);
    expect((resp.body as { amount_cents: number }).amount_cents).toBe(3000);
    expect(state.entries[id].payment_status).toBe('refunded');
    expect(state.entries[id].entry_status).toBe('withdrawn');
    const enr = state.enrollments[PHASE4_IDS.enrollmentWithdraw];
    expect(enr.payment_status).toBe('refunded');
    expect(enr.refund_amount).toBe(30);
    expect(enr.refunded_at).not.toBeNull();

    assertNoSharedWrites(audit);
  });

  it('partial refund marks partial-refund and clamps to the entry fee', () => {
    const state = createPhase4SeamState();
    const audit: AuditEntry[] = [];
    const id = PHASE4_IDS.entryWithdraw;
    const resp = run(state, audit, {
      method: 'POST',
      url: `${FN}/stripe-refund-entry`,
      postData: { entry_id: id, amount_cents: 1500 },
    });
    expect((resp.body as { amount_cents: number }).amount_cents).toBe(1500);
    expect(state.entries[id].payment_status).toBe('partial-refund');
  });

  it('rejects a refund for an unknown entry', () => {
    const state = createPhase4SeamState();
    const audit: AuditEntry[] = [];
    const resp = run(state, audit, {
      method: 'POST',
      url: `${FN}/stripe-refund-entry`,
      postData: { entry_id: 'nope' },
    });
    expect(resp.status).toBe(500);
  });
});

describe('Seam 5: results release', () => {
  it('exhibitor cannot see result until secretary releases the class', () => {
    const state = createPhase4SeamState();
    const audit: AuditEntry[] = [];

    // Before release: results view is empty (gated).
    const before = run(state, audit, {
      method: 'GET',
      url: `${REST}/view_entry_with_results?show_id=eq.${PHASE4_IDS.show}`,
      postData: null,
    });
    expect((before.body as unknown[]).length).toBe(0);

    // Secretary releases the class (replication sync PATCHes classes).
    run(state, audit, {
      method: 'PATCH',
      url: `${REST}/classes?id=eq.${PHASE4_IDS.classOpen}`,
      postData: {
        results_released_at: '2026-06-15T15:00:00.000Z',
        results_released_by: PHASE4_IDS.secretary,
      },
    });
    expect(state.classes[PHASE4_IDS.classOpen].results_released_at).toBe(
      '2026-06-15T15:00:00.000Z'
    );

    // After release: the scored entry's result becomes visible.
    const after = run(state, audit, {
      method: 'GET',
      url: `${REST}/view_entry_with_results?show_id=eq.${PHASE4_IDS.show}`,
      postData: null,
    });
    const rows = after.body as Array<{ entry_id: string; final_placement: number }>;
    expect(rows.length).toBe(1);
    expect(rows[0].entry_id).toBe(PHASE4_IDS.entryResult);
    expect(rows[0].final_placement).toBe(1);

    assertNoSharedWrites(audit);
    assertNoUnhandledAppDataMutations(audit);
  });
});

describe('Write safety guarantees', () => {
  it('auth traffic passes through untouched and is not flagged', () => {
    const state = createPhase4SeamState();
    const audit: AuditEntry[] = [];
    const resp = run(state, audit, {
      method: 'POST',
      url: 'https://x.supabase.co/auth/v1/token?grant_type=password',
      postData: { email: 'a@b.c', password: 'x' },
    });
    expect(resp.action).toBe('continue');
    expect(audit[0].isFixtureWrite).toBe(false);
    expect(audit[0].isUnhandledMutation).toBe(false);
    assertNoUnhandledAppDataMutations(audit);
  });

  it('blocks an unmodeled app-data mutation and flags it (never reaches network)', () => {
    const state = createPhase4SeamState();
    const audit: AuditEntry[] = [];
    const resp = run(state, audit, {
      method: 'POST',
      url: `${REST}/shows`,
      postData: { name: 'Sneaky shared write' },
    });
    expect(resp.action).toBe('fulfill'); // blocked locally, not continued
    expect(resp.status).toBe(500);
    expect(audit[0].isUnhandledMutation).toBe(true);
    expect(() => assertNoUnhandledAppDataMutations(audit)).toThrow(/unmodeled mutation/);
  });

  it('an explicitly allowed write path may pass through', () => {
    const state = createPhase4SeamState();
    const { response, audit } = handleSeamRequest(
      state,
      { method: 'POST', url: `${REST}/analytics_events`, postData: { e: 'x' } },
      { ...opts, allowWritePaths: [/analytics_events/] }
    );
    expect(response.action).toBe('continue');
    expect(audit.isUnhandledMutation).toBe(false);
  });

  it('assertNoSharedWrites throws if a fixture write was continued', () => {
    const leaked: AuditEntry[] = [
      {
        method: 'PATCH',
        url: `${REST}/entries?id=eq.x`,
        table: 'entries',
        payload: {},
        fulfilled: false,
        status: 0,
        seam: 'scratch',
        isFixtureWrite: true,
        isUnhandledMutation: false,
        elapsedMs: 0,
      },
    ];
    expect(() => assertNoSharedWrites(leaked)).toThrow(/reached the network/);
  });

  it('records latency (elapsedMs) per request', () => {
    const state = createPhase4SeamState();
    const audit: AuditEntry[] = [];
    run(state, audit, {
      method: 'PATCH',
      url: `${REST}/entries?id=eq.${PHASE4_IDS.entryScratch}`,
      postData: { entry_status: 'scratch-requested' },
    });
    expect(audit[0].elapsedMs).toBeGreaterThanOrEqual(0);
    expect(audit[0].seam).toBe('scratch');
  });
});

describe('createPhase4SeamState isolation', () => {
  it('returns a fresh deep clone each call', () => {
    const a = createPhase4SeamState();
    const b = createPhase4SeamState();
    a.entries[PHASE4_IDS.entryScratch].entry_status = 'scratched';
    expect(b.entries[PHASE4_IDS.entryScratch].entry_status).toBe('confirmed');
    expect(a).not.toBe(b);
  });
});
