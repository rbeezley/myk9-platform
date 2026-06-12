// Pure helper shared by stripe-webhook (Deno) and vitest. Keep this module
// free of Deno/npm imports so the colocated test runs under Node.

// Mirrors a Stripe Connect account's lifecycle flags onto club_stripe_accounts.
// Missing fields map to false — a partial payload must never enable payouts.
export function accountToRowPatch(account: {
  details_submitted?: boolean;
  payouts_enabled?: boolean;
}): { onboarding_complete: boolean; payouts_enabled: boolean } {
  return {
    onboarding_complete: account.details_submitted === true,
    payouts_enabled: account.payouts_enabled === true,
  };
}
