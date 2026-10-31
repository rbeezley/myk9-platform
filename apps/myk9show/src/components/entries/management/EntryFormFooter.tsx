import { cn } from '@/lib/utils';

interface EntryFormFooterProps {
  totalDollars: number;
  paidDollars: number;
  remainingDollars: number;
}

/** The form's money total. Display only: the figures come from the payment controls. */
export function EntryFormFooter({
  totalDollars,
  paidDollars,
  remainingDollars,
}: EntryFormFooterProps) {
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
