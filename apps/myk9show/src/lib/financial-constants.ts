/** Payment status → Tailwind badge class names, shared across financial summary components */
export const paymentStatusColors: Record<string, string> = {
  paid: 'bg-success/10 text-success ',
  pending: 'bg-warning/10 text-warning ',
  refunded: 'bg-destructive/10 text-destructive ',
  waived: 'bg-info/10 text-info ',
};
