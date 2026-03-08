/** Payment status → Tailwind badge class names, shared across financial summary components */
export const paymentStatusColors: Record<string, string> = {
  paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  refunded: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  waived: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};
