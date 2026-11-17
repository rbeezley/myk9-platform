import { cn } from '@/lib/utils';
import { AMOUNT_NOT_AVAILABLE } from './enrollmentPayment';

interface EntryFormFooterProps {
  totalDollars: number;
  paidDollars: number;
  remainingDollars: number;
  /**
   * MYK9-1968: the form's payment record is not loaded (offline, or the read failed), so the
   * figures are not the form's. Say so rather than quote a total built from entry fees.
   */
  amountUnknown?: boolean | undefined;
}

/** The form's money total. Display only: the figures come from the payment controls. */
export function EntryFormFooter({
  totalDollars,
  paidDollars,
  remainingDollars,
  amountUnknown = false,
}: EntryFormFooterProps) {
  if (amountUnknown) {
    return (
      <footer className="flex flex-wrap justify-between gap-2 border-t px-5 py-3.5 text-sm text-muted-foreground">
        <span>Payment record not loaded</span>
        <span className="font-semibold text-warning">{AMOUNT_NOT_AVAILABLE}</span>
      </footer>
    );
  }
  const due = remainingDollars > 0;
  return (
    <footer className="flex flex-wrap justify-between gap-2 border-t px-5 py-3.5 text-sm text-muted-foreground">
      <span>
        Total ${totalDollars.toFixed(2)} · paid ${paidDollars.toFixed(2)}
      </span>
      <span className={cn('font-semibold', due ? 'text-destructive' : 'text-success')}>
        {due ? `$${remainingDollars.toFixed(2)} due` : 'Paid in full'}
      </span>
    </footer>
  );
}
