/** Payment status → Tailwind badge class names, shared across financial summary components */
export const paymentStatusColors: Record<string, string> = {
  paid: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  pending: 'bg-warning/10 text-warning ',
  refunded: 'bg-destructive/10 text-destructive ',
  waived: 'bg-info/10 text-info ',
};
