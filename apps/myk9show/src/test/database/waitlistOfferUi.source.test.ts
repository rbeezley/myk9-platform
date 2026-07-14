import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hook = readFileSync(
  resolve(__dirname, '../../hooks/queries/useMyWaitlistEntries.ts'),
  'utf8'
);
const section = readFileSync(
  resolve(__dirname, '../../pages/MyEntriesPage/modules/WaitListSection.tsx'),
  'utf8'
);

describe('My Entries waitlist-offer recovery wiring', () => {
  it('fetches the promoted entry for actions and fetches a terminal row only when the owner deep-links to it', () => {
    expect(hook).toContain('promoted_entry_id');
    expect(hook).toContain('focusedOfferId: string | null = null');
    expect(hook).toContain(".eq('id', focusedOfferId!)");
    expect(hook).toContain(".eq('exhibitor_id', exhibitorId!)");
    expect(hook).toContain('my-focused-waitlist-offer');
  });

  it('returns from Stripe to the same existing My Entries offer and invokes only owner-scoped functions', () => {
    expect(hook).toContain("new URL('/exhibitor/entries', window.location.origin)");
    expect(hook).toContain("returnUrl.searchParams.set('waitlistOffer', waitlistEntryId)");
    expect(hook).toContain("supabase.functions.invoke('stripe-payment-link'");
    expect(hook).toContain("supabase.functions.invoke('decline-waitlist-offer'");
  });

  it('renders accessible offer actions and focuses the deep-linked row without a new route', () => {
    expect(section).toContain("role=\"region\"");
    expect(section).toContain('Complete payment');
    expect(section).toContain('Decline');
    expect(section).toContain('min-h-[44px]');
    expect(section).toContain('scrollIntoView({ behavior: \'smooth\', block: \'center\' })');
    expect(section).not.toContain('WaitListPaymentPage');
  });
});
