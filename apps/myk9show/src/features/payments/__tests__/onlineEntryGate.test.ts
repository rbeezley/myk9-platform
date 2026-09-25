import { describe, it, expect } from 'vitest';
import {
  canEnableOnlineEntries,
  isPublishGateDbError,
  publishGateDbErrorMessage,
  PUBLISH_BLOCKED_MESSAGE,
  PUBLISH_GATE_ERRCODE,
  PUBLISH_GATE_ERRCODE_UNAUTHORIZED,
  CLUB_UNAUTHORIZED_MESSAGE,
  CLUB_REQUIRED_MESSAGE,
  entryWindowPublishError,
  ENTRY_WINDOW_REQUIRED_MESSAGE,
  ENTRY_WINDOW_ORDER_MESSAGE,
  PUBLISH_GATE_ERRCODE_ENTRY_WINDOW,
} from '../onlineEntryGate';
import { createDatabaseError } from '@/services/database/databaseError';

describe('canEnableOnlineEntries', () => {
  it('allows publishing when payouts are enabled', () => {
    expect(canEnableOnlineEntries({ payouts_enabled: true })).toBe(true);
  });

  it('fails closed when the club has no Stripe account row', () => {
    expect(canEnableOnlineEntries(null)).toBe(false);
    expect(canEnableOnlineEntries(undefined)).toBe(false);
  });

  it('fails closed while onboarding is incomplete or payouts are pending', () => {
    expect(canEnableOnlineEntries({ payouts_enabled: false })).toBe(false);
  });
});

// MYK9-579: enforce_show_publish_gate() (supabase/migrations/20260916003500)
// is the DB-side backstop for this same gate. It raises SQLSTATE MK003 for
// BOTH of its refusals (missing club, and no payouts-enabled Stripe account),
// with its own RAISE EXCEPTION text already equal to this module's friendly
// copy — these two helpers are how a mutation catch block recognizes and
// surfaces that refusal.
describe('isPublishGateDbError', () => {
  it('recognizes the trigger SQLSTATE on a DatabaseError-shaped object', () => {
    expect(
      isPublishGateDbError({ code: PUBLISH_GATE_ERRCODE, message: PUBLISH_BLOCKED_MESSAGE })
    ).toBe(true);
  });

  it('does not match an unrelated error code', () => {
    expect(isPublishGateDbError({ code: '23503', message: 'foreign key violation' })).toBe(false);
    expect(isPublishGateDbError({ code: 'MK002', message: 'paid or scored entries' })).toBe(false);
  });

  it('does not match a plain Error with no code, a string, or nullish values', () => {
    expect(isPublishGateDbError(new Error('Network error'))).toBe(false);
    expect(isPublishGateDbError('some string')).toBe(false);
    expect(isPublishGateDbError(null)).toBe(false);
    expect(isPublishGateDbError(undefined)).toBe(false);
  });
});

// MYK9-572: enforce_show_publish_gate() also raises MK004 when the club
// exists but is not yet authorized by a site admin — a distinct SQLSTATE
// from the Stripe-readiness refusal (MK003) so the client can show distinct
// copy, recognized by the same two helpers.
describe('isPublishGateDbError / publishGateDbErrorMessage — club-authorization refusal (MK004)', () => {
  it('recognizes the club-authorization SQLSTATE', () => {
    expect(
      isPublishGateDbError({
        code: PUBLISH_GATE_ERRCODE_UNAUTHORIZED,
        message: CLUB_UNAUTHORIZED_MESSAGE,
      })
    ).toBe(true);
  });

  it('trusts the DB text verbatim for the club-authorization refusal', () => {
    const dbError = { code: PUBLISH_GATE_ERRCODE_UNAUTHORIZED, message: CLUB_UNAUTHORIZED_MESSAGE };
    expect(publishGateDbErrorMessage(dbError)).toBe(CLUB_UNAUTHORIZED_MESSAGE);
  });
});

describe('publishGateDbErrorMessage', () => {
  it('trusts the DB text verbatim for the no-Stripe-account refusal', () => {
    const dbError = { code: PUBLISH_GATE_ERRCODE, message: PUBLISH_BLOCKED_MESSAGE };
    expect(publishGateDbErrorMessage(dbError)).toBe(PUBLISH_BLOCKED_MESSAGE);
  });

  it('trusts the DB text verbatim for the missing-club refusal — a DIFFERENT message under the SAME code', () => {
    const dbError = { code: PUBLISH_GATE_ERRCODE, message: CLUB_REQUIRED_MESSAGE };
    expect(publishGateDbErrorMessage(dbError)).toBe(CLUB_REQUIRED_MESSAGE);
  });

  it('returns null for any error that is not the publish-gate refusal', () => {
    expect(publishGateDbErrorMessage(new Error('Network error'))).toBeNull();
    expect(publishGateDbErrorMessage({ code: '23503', message: 'nope' })).toBeNull();
  });

  // Nothing pinned the plain-object shape createDatabaseError actually
  // produces -- the tests above hand-build { code, message } literals, but
  // the real pill catch block (ShowStatusPill.tsx) receives whatever
  // createDatabaseError() (services/database/databaseError.ts) returns for
  // the DB trigger's rejection. Prove the friendly copy survives that shape
  // too, not just the hand-built one.
  it('survives the real createDatabaseError() shape the pill actually catches', () => {
    const dbError = createDatabaseError({
      code: PUBLISH_GATE_ERRCODE,
      message: PUBLISH_BLOCKED_MESSAGE,
    });

    expect(isPublishGateDbError(dbError)).toBe(true);
    expect(publishGateDbErrorMessage(dbError)).toBe(PUBLISH_BLOCKED_MESSAGE);
  });
});

// MYK9-716: a draft may have no entry window, but publishing requires one.
// Mirrors enforce_show_publish_gate()'s MK005 refusal
// (supabase/migrations/20260925023700).
describe('entryWindowPublishError', () => {
  const OPEN = '2026-10-01T12:00:00.000Z';
  const CLOSE = '2026-10-20T04:59:00.000Z';

  it('passes a window that opens before it closes', () => {
    expect(entryWindowPublishError(OPEN, CLOSE)).toBeNull();
  });

  it('requires both dates', () => {
    expect(entryWindowPublishError(null, null)).toBe(ENTRY_WINDOW_REQUIRED_MESSAGE);
    expect(entryWindowPublishError(undefined, CLOSE)).toBe(ENTRY_WINDOW_REQUIRED_MESSAGE);
    expect(entryWindowPublishError(OPEN, '')).toBe(ENTRY_WINDOW_REQUIRED_MESSAGE);
    expect(entryWindowPublishError('  ', CLOSE)).toBe(ENTRY_WINDOW_REQUIRED_MESSAGE);
  });

  it('treats an unparseable date as missing, not as set', () => {
    expect(entryWindowPublishError('not a date', CLOSE)).toBe(ENTRY_WINDOW_REQUIRED_MESSAGE);
  });

  it('refuses a window that closes before, or at the moment, it opens', () => {
    expect(entryWindowPublishError(CLOSE, OPEN)).toBe(ENTRY_WINDOW_ORDER_MESSAGE);
    expect(entryWindowPublishError(OPEN, OPEN)).toBe(ENTRY_WINDOW_ORDER_MESSAGE);
  });

  it('recognises the trigger refusal (MK005) as a publish-gate error with its own copy', () => {
    const dbError = createDatabaseError({
      code: PUBLISH_GATE_ERRCODE_ENTRY_WINDOW,
      message: ENTRY_WINDOW_REQUIRED_MESSAGE,
    });
    expect(PUBLISH_GATE_ERRCODE_ENTRY_WINDOW).toBe('MK005');
    expect(isPublishGateDbError(dbError)).toBe(true);
    expect(publishGateDbErrorMessage(dbError)).toBe(ENTRY_WINDOW_REQUIRED_MESSAGE);
  });
});
