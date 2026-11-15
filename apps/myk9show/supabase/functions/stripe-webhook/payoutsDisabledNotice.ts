// Stripe switched a club's payouts off: email the club's admins and contact
// address once, with the link that fixes it (MYK9-1986).
//
// "Once" is the database transition itself: an UPDATE that only matches a row
// whose payouts_enabled is still true. The first account.updated that turns
// payouts off flips the row and is the only one that sees it come back; every
// later account.updated (Stripe sends many, and re-delivers) matches nothing.
// Payouts turning back on and off again is a new episode and emails again.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import { loadClubMoneyRecipients } from '../_shared/clubMoneyRecipients.ts';
import {
  clubPaymentsUrl,
  payoutsDisabledEmail,
  sendClubMoneyEmail,
  type SendEmail,
} from '../_shared/clubMoneyEmails.ts';

export interface PayoutsDisabledDeps {
  /** Flip payouts_enabled true -> false; returns the club ids whose row actually flipped. */
  claimPayoutsTurnedOff: () => Promise<string[]>;
  loadClub: (clubId: string) => Promise<{ name: string; email: string | null } | null>;
  loadRecipients: (clubId: string, contactEmail: string | null) => Promise<string[]>;
  send: SendEmail;
  siteUrl: string | null | undefined;
}

/**
 * Run BEFORE the general account.updated row patch, which would otherwise set
 * payouts_enabled=false first and leave no transition to claim. Never throws.
 * Returns how many messages were sent.
 */
export async function notifyPayoutsTurnedOff(
  deps: PayoutsDisabledDeps,
  patch: { payouts_enabled: boolean }
): Promise<number> {
  if (patch.payouts_enabled) return 0;
  let sent = 0;
  try {
    const clubIds = await deps.claimPayoutsTurnedOff();
    for (const clubId of clubIds) {
      const club = await deps.loadClub(clubId);
      if (!club) continue;
      const recipients = await deps.loadRecipients(clubId, club.email);
      sent += await sendClubMoneyEmail(
        recipients,
        payoutsDisabledEmail({
          clubName: club.name,
          paymentsUrl: clubPaymentsUrl(deps.siteUrl, clubId),
        }),
        deps.send
      );
    }
  } catch (err) {
    console.error('Payouts-turned-off club email failed:', err);
  }
  return sent;
}

/** The database side of the deps, for one Stripe account id. */
export function createPayoutsDisabledDeps(
  supabase: SupabaseClient,
  stripeAccountId: string,
  send: SendEmail,
  siteUrl: string | null | undefined
): PayoutsDisabledDeps {
  return {
    claimPayoutsTurnedOff: async () => {
      const { data, error } = await supabase
        .from('club_stripe_accounts')
        .update({ payouts_enabled: false })
        .eq('stripe_account_id', stripeAccountId)
        .eq('payouts_enabled', true)
        .select('club_id');
      if (error) {
        console.error(`Payouts-off transition failed for ${stripeAccountId}:`, error);
        return [];
      }
      return ((data ?? []) as Array<{ club_id: string }>).map(row => row.club_id);
    },
    loadClub: async clubId => {
      const { data } = await supabase
        .from('clubs')
        .select('name, email')
        .eq('id', clubId)
        .maybeSingle();
      return (data as { name: string; email: string | null } | null) ?? null;
    },
    loadRecipients: (clubId, contactEmail) =>
      loadClubMoneyRecipients(supabase, clubId, contactEmail),
    send,
    siteUrl,
  };
}
