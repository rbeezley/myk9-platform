// Stripe turned a club's payouts back on: resolve that club's open "Stripe
// turned off payouts" alerts (MYK9-2540). They are live alerts: the condition
// they describe has cleared, so nobody should have to press Resolve, and an
// alert left open after payouts return reads as an outage that is not there.
//
// "Back on" is the database transition, the mirror of payoutsDisabledNotice:
// an UPDATE that only matches a row whose payouts_enabled is still false. The
// first account.updated that turns payouts on flips it and is the only one
// that resolves; every later one (Stripe re-delivers) matches nothing. Only
// the club whose row flipped is touched, so another club's alert stays open.
// Nothing here moves money.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import type { AlertMatch } from '../_shared/alertResolve.ts';
import { PAYOUTS_ALERT_SOURCE, payoutsTurnedOffKeyPrefix } from './payoutsDisabledNotice.ts';

/** `resolveOperatorAlerts` from `_shared/alertAdmin.ts`, injected (it reads Deno.env at load). */
export type ResolveAlerts = (source: string, match: AlertMatch, note: string) => Promise<number>;

export interface PayoutsReturnedDeps {
  /** Flip payouts_enabled false -> true; returns the club ids whose row actually flipped. */
  claimPayoutsTurnedOn: () => Promise<string[]>;
  resolveAlerts: ResolveAlerts;
  now: () => Date;
}

/** The note an auto-resolved payouts alert carries. */
export function payoutsReturnedNote(at: Date): string {
  return `Payouts returned: Stripe reported payouts enabled again at ${at.toISOString()}.`;
}

/**
 * Run BEFORE the general account.updated row patch, which would otherwise set
 * payouts_enabled=true first and leave no transition to claim. Never throws.
 * Returns how many alerts it resolved.
 */
export async function resolvePayoutsReturned(
  deps: PayoutsReturnedDeps,
  patch: { payouts_enabled: boolean }
): Promise<number> {
  if (!patch.payouts_enabled) return 0;
  let clubIds: string[];
  try {
    clubIds = await deps.claimPayoutsTurnedOn();
  } catch (err) {
    console.error('Payouts-returned transition failed:', err);
    return 0;
  }
  let resolved = 0;
  for (const clubId of clubIds) {
    try {
      resolved += await deps.resolveAlerts(
        PAYOUTS_ALERT_SOURCE,
        { dedupeKeyPrefix: payoutsTurnedOffKeyPrefix(clubId) },
        payoutsReturnedNote(deps.now())
      );
    } catch (err) {
      console.error(`Payouts-returned alert resolve failed for club ${clubId}:`, err);
    }
  }
  return resolved;
}

/** The database side of the deps, for one Stripe account id. */
export function createPayoutsReturnedDeps(
  supabase: SupabaseClient,
  stripeAccountId: string,
  resolveAlerts: ResolveAlerts
): PayoutsReturnedDeps {
  return {
    claimPayoutsTurnedOn: async () => {
      const { data, error } = await supabase
        .from('club_stripe_accounts')
        .update({ payouts_enabled: true })
        .eq('stripe_account_id', stripeAccountId)
        .eq('payouts_enabled', false)
        .select('club_id');
      if (error) {
        console.error(`Payouts-on transition failed for ${stripeAccountId}:`, error);
        return [];
      }
      return ((data ?? []) as Array<{ club_id: string }>).map(row => row.club_id);
    },
    resolveAlerts,
    now: () => new Date(),
  };
}
