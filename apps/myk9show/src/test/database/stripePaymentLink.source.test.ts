import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../../../supabase/functions/stripe-payment-link/index.ts'),
  'utf8'
);

describe('stripe-payment-link internal waitlist path', () => {
  it('allows an exhibitor only when every requested entry is their active, unexpired offer', () => {
    // The public Edge Function contract must not turn ordinary pending entries
    // into self-service checkout. Every supplied entry is checked against the
    // caller's exhibitor profile and an active offer before Stripe is reached.
    expect(source).toContain("from('exhibitor_profiles')");
    expect(source).toContain(".eq('auth_user_id', userId)");
    expect(source).toContain("from('waitlist_entries')");
    expect(source).toContain(".in('promoted_entry_id', entry_ids)");
    expect(source).toContain(".eq('exhibitor_id', exhibitorProfile.id)");
    expect(source).toContain(".eq('status', 'offered')");
    expect(source).toContain(".gt('offer_expires_at', new Date().toISOString())");
    expect(source).toContain('activeOfferEntryIds.size !== entry_ids.length');
    expect(source).toContain('Not authorized to request payment for these waitlist offers');
  });

  it('accepts the cron secret header for trusted waitlist-cascade calls', () => {
    expect(source).toContain("req.headers.get('x-function-secret')");
    expect(source).toContain('async function secretMatches');
    expect(source).toContain("crypto.subtle.digest('SHA-256'");
    expect(source).toContain("await secretMatches(req.headers.get('x-function-secret'))");
    expect(source).toContain('if (!isInternalCall)');
  });

  it('keeps public callers on the authenticated secretary/admin authorization path', () => {
    expect(source).toContain('supabase.auth.getUser');
    expect(source).toContain("userClient.rpc('is_show_secretary'");
    expect(source).toContain("userClient.rpc('is_club_admin'");
    expect(source).toContain("userClient.rpc('is_site_admin'");
  });

  it('marks cron-created links as service-created instead of inventing a user id', () => {
    expect(source).toContain('created_by: userId');
    expect(source).toContain("userId ?? 'cron'");
  });

  it('shares inactive entry statuses with payment reconciliation', () => {
    expect(source).toContain(
      "import { INACTIVE_ENTRY_STATUSES } from '../_shared/entryPaymentReconcile.ts'"
    );
    expect(source).not.toContain('const INACTIVE_ENTRY_STATUSES = new Set');
  });

  it('blocks re-request only on an actually-paid prior Checkout session', () => {
    expect(source).toContain('priorPaymentStatus');
    expect(source).toContain("priorPaymentStatus === 'paid'");
    expect(source).toContain('recheckPaymentStatus');
    expect(source).toContain("recheckPaymentStatus === 'paid'");
    expect(source).not.toContain("priorStatus === 'complete'");
    expect(source).not.toContain("recheck === 'complete'");
  });

  it('fails closed instead of creating a second session when a prior session cannot be safely replaced', () => {
    expect(source).toContain('error: priorLinksError');
    expect(source).toContain('Could not check an existing payment link. Please try again.');
    expect(source).toContain('Could not safely replace an existing payment link. Please try again.');
    expect(source).toContain('Could not verify an existing payment link. Please try again.');
    expect(source).not.toContain('leaving link open:');
  });

  it('discloses the withdrawal policy to the payer via Stripe custom_text (best-effort)', () => {
    // The payer (mail-in/waitlist) never sees the myK9 cart disclosure, so the
    // policy is resolved here and passed into the Checkout Session custom_text.
    expect(source).toContain('describeWithdrawalPolicyText');
    expect(source).toContain('resolveWithdrawalPolicy');
    expect(source).toContain('withdrawalPolicyText');
    // Best-effort: a resolution failure (incl. columns not yet migrated) must not
    // block link generation.
    expect(source).toContain('skipping disclosure');
  });
});
