import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EntryFormPaymentMoreOptionsProps {
  openPartialPayment: () => void;
  askMarkPaidOnline: () => void;
}

/**
 * The quieter half of the payment item: Partial and Online, through the same
 * openers as the Payment section's menu (Online asks first). Refunds and resets stay
 * there; a refund is a person's decision in its own dialog.
 */
export function EntryFormPaymentMoreOptions({
  openPartialPayment,
  askMarkPaidOnline,
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
        <DropdownMenuItem onClick={askMarkPaidOnline}>Paid in Full: Online…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
