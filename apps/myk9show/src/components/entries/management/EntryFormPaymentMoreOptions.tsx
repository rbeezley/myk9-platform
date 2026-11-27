import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EntryFormPaymentMoreOptionsProps {
  askMarkPaidOnline: () => void;
}

/**
 * The quieter half of the payment item: Online, through the same opener as the Payment
 * section's menu (it asks first). Refunds and resets stay there; a refund is a person's
 * decision in its own dialog.
 */
export function EntryFormPaymentMoreOptions({
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
        <DropdownMenuItem onClick={askMarkPaidOnline}>Paid in Full: Online…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
