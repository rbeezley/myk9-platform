import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EntryFormPaymentMoreOptionsProps {
  openPartialPayment: () => void;
  markPaidOnline: () => void;
}

/**
 * The quieter half of the payment item: Partial and Online, through the same
 * openers and handler as the Payment section's menu. Refunds and resets stay
 * there; a refund is a person's decision in its own dialog.
 */
export function EntryFormPaymentMoreOptions({
  openPartialPayment,
  markPaidOnline,
}: EntryFormPaymentMoreOptionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="min-h-11 text-muted-foreground">
          More payment options
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={openPartialPayment}>Partial Payment…</DropdownMenuItem>
        <DropdownMenuItem onClick={markPaidOnline}>Paid in Full: Online</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
