import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../..');
const declineFunctionPath = resolve(
  root,
  'apps/myk9show/supabase/functions/decline-waitlist-offer/index.ts'
);
const paymentLinkGuardPath = resolve(
  root,
  'supabase/migrations/20260713110000_waitlist_offer_payment_guard.sql'
);

function readRequired(path: string): string {
  expect(existsSync(path)).toBe(true);
  return readFileSync(path, 'utf8');
}

describe('waitlist offer payment and decline contracts', () => {
  it('rejects new tracked payment links once a promoted offer is no longer actionable', () => {
    const migration = readRequired(paymentLinkGuardPath);

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.assert_active_waitlist_offer_payment_link');
    expect(migration).toContain("NEW.entry_ids");
    expect(migration).toContain("waitlist.status IS DISTINCT FROM 'offered'");
    expect(migration).toContain('waitlist.offer_expires_at <= now()');
    expect(migration).toContain("entry.entry_status NOT IN ('pending-payment', 'pending')");
    expect(migration).toContain("entry.payment_status IS DISTINCT FROM 'pending'");
    expect(migration).toContain('CREATE TRIGGER trg_entry_payment_links_require_active_waitlist_offer');
  });

  it('authorizes decline only for the caller-owned offered row and fails closed on paid races', () => {
    const source = readRequired(declineFunctionPath);

    expect(source).toContain('supabase.auth.getUser');
    expect(source).toContain("from('exhibitor_profiles')");
    expect(source).toContain(".eq('auth_user_id', user.id)");
    expect(source).toContain("from('waitlist_entries')");
    expect(source).toContain(".eq('exhibitor_id', exhibitorProfile.id)");
    expect(source).toContain(".eq('status', 'offered')");
    expect(source).toContain(".gt('offer_expires_at', nowIso)");
    expect(source).toContain('expireWaitlistOffer');
    expect(source).toContain("result === 'paid'");
    expect(source).toContain('Payment is being reconciled; refresh My Entries shortly.');
  });

  it('expires a lapsed offered row instead of recording a late user decline', () => {
    const source = readRequired(declineFunctionPath);

    expect(source).toContain("ownedOffer.offer_expires_at <= nowIso");
    expect(source).toContain("terminalStatus: 'expired'");
  });

  it('treats an already-closed offer as a calm idempotent result', () => {
    const source = readRequired(declineFunctionPath);

    expect(source).toContain("ownedOffer.status === 'expired' || ownedOffer.status === 'declined'");
    expect(source).toContain('already_closed: true');
  });
});
