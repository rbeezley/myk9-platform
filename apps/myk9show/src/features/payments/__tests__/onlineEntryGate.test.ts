import { describe, it, expect } from 'vitest';
import {
  canEnableOnlineEntries,
  isPublishGateDbError,
  publishGateDbErrorMessage,
  PUBLISH_BLOCKED_MESSAGE,
  PUBLISH_GATE_ERRCODE,
  CLUB_REQUIRED_MESSAGE,
} from '../onlineEntryGate';

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

// MYK9-579: enforce_show_publish_gate() (supabase/migrations/20260915221500)
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
});
