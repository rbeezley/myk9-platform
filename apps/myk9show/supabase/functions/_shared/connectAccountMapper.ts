// Pure helper shared by stripe-webhook (Deno) and vitest. Keep this module
// free of Deno/npm imports so the colocated test runs under Node.

// Mirrors a Stripe Connect account's lifecycle flags onto club_stripe_accounts.
// Missing flags map to false: a partial payload must never enable payouts.
// livemode comes from the Stripe event (event.livemode), never the account
// payload, which carries none: defaulting it would record a live account as
// test on any account update (MYK9-2187).
export function accountToRowPatch(
  account: {
    details_submitted?: boolean;
    payouts_enabled?: boolean;
  },
  eventLivemode: boolean
): { onboarding_complete: boolean; payouts_enabled: boolean; livemode: boolean } {
  return {
    onboarding_complete: account.details_submitted === true,
    payouts_enabled: account.payouts_enabled === true,
    livemode: eventLivemode,
  };
}
