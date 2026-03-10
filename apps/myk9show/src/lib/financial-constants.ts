/** Payment status → Tailwind badge class names, shared across financial summary components */
export const paymentStatusColors: Record<string, string> = {
  paid: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  refunded: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  waived: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};
