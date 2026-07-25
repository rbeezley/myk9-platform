// Stripe dashboard URL builders (unified-financial-dashboard, MYK9-54, task
// 3.2). Pure TypeScript only — kept out of the component file so
// StripeLinkOut.tsx stays react-refresh-clean (component-only exports).

/** Build the Stripe dashboard URL for a transfer id. */
export function stripeTransferDashboardUrl(transferId: string): string {
  return `https://dashboard.stripe.com/connect/transfers/${encodeURIComponent(transferId)}`;
}
