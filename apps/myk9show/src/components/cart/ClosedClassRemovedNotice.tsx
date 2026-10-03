/**
 * Tells the exhibitor which classes left their saved cart, and why (MYK9-656).
 *
 * A cart saved in an earlier session is re-checked by the server when it loads,
 * and a class that was cancelled, has started, has finished, or filled with no
 * wait list is taken out so it cannot be paid for. Taking it out silently would
 * be worse than the stale tick it replaces: the exhibitor would simply find a
 * class missing. So the store keeps what it removed (persisted, because the
 * lines are already gone), and the wizard's class step and /cart both render
 * this until it is dismissed.
 *
 * INTENT: "This respects my time" — one calm sentence per class in dog-show
 * words, no error styling (nothing went wrong on their side), and a dismiss.
 */
import { useMemo, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCartStore } from '@/store/cartStore';
import type { DroppedCartItem } from '@/store/cartStore.types';
import { describeDroppedItem } from './closedClassRemovedNotice.helpers';

const NONE: DroppedCartItem[] = [];

/** The calm, dismissible shell both cart-removal notices share. */
function CartRemovalNotice({
  className,
  onDismiss,
  children,
}: {
  className?: string | undefined;
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <Alert className={`border-primary/30 bg-primary/5 ${className ?? ''}`} role="status">
      <Info className="h-4 w-4 text-primary" />
      <AlertDescription className="flex items-start justify-between gap-4">
        <div className="text-foreground">{children}</div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-3 -mt-3 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <X className="h-4 w-4" />
        </button>
      </AlertDescription>
    </Alert>
  );
}

export function ClosedClassRemovedNotice({ className }: { className?: string }) {
  const allItems = useCartStore(state => state.droppedClosedClassItems) ?? NONE;
  const cartId = useCartStore(state => state.cart?.id ?? null);
  // Only the loaded cart's removals: a persisted notice from another show's
  // cart must never read as this cart's (Codex P2 on PR #2438).
  const items = useMemo(() => allItems.filter(item => item.cartId === cartId), [allItems, cartId]);
  const dismiss = useCartStore(state => state.dismissDroppedClosedClassItems);

  if (items.length === 0) return null;

  const heading =
    items.length === 1
      ? 'We took a class out of your saved cart, so you will not be charged for it.'
      : `We took ${items.length} classes out of your saved cart, so you will not be charged for them.`;

  return (
    <CartRemovalNotice className={className} onDismiss={dismiss}>
      <p className="font-medium">{heading}</p>
      <ul className="mt-1 list-disc pl-5">
        {items.map(item => (
          <li key={item.itemId}>{describeDroppedItem(item)}</li>
        ))}
      </ul>
    </CartRemovalNotice>
  );
}

/**
 * A Finish Payment link named entries the recovered cart could not hold
 * (MYK9-873). Recovery keeps only entries still unpaid and open for payment, so
 * a link opened after some were paid or withdrawn rebuilds a smaller cart; this
 * says how many are missing and why, so a payment that still matters can be
 * made again rather than silently skipped.
 */
export function RecoveryEntriesDroppedNotice({ className }: { className?: string }) {
  const notice = useCartStore(state => state.droppedRecoveryEntries);
  const cartId = useCartStore(state => state.cart?.id ?? null);
  const dismiss = useCartStore(state => state.dismissDroppedRecoveryEntries);

  if (!notice || notice.cartId !== cartId) return null;

  const verb = notice.dropped === 1 ? 'is' : 'are';

  return (
    <CartRemovalNotice className={className} onDismiss={dismiss}>
      <p className="font-medium">
        {`${notice.dropped} of the ${notice.requested} entries in your payment link ${verb} not in this cart.`}
      </p>
      <p className="mt-1">
        An entry that is already paid, withdrawn, or no longer open for payment cannot be paid here.
        Check My Entries, and enter again any that still need paying.
      </p>
    </CartRemovalNotice>
  );
}
