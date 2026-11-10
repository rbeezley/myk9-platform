/**
 * MYK9-1844: what the subscription card says when billing details or the billing
 * page cannot be reached. Reading and opening change nothing, so a retry is safe.
 */
export const BILLING_COPY = {
  /** The card has no Retry of its own for billing details. */
  loadFailed: "We couldn't load your billing details. Refresh the page to try again.",
  portalFailed:
    "We couldn't open your subscription settings. Nothing was changed. Press Manage Subscription to try again.",
} as const;
