import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface ForceDeleteOverrideProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Distinguishes the control when more than one dialog can be mounted. */
  id?: string;
}

/**
 * The opt-in that unlocks an admin force-delete.
 *
 * INTENT: this is deliberate friction, not decoration. The delete it unlocks
 * strands a captured Stripe charge and can re-rank a scored class, so the
 * consequence is spelled out in plain money/results language ABOVE the control
 * and the box starts unchecked every time the dialog opens. Do not turn this
 * into a one-click "force" button, and do not soften the wording to something
 * like "override safety check" — the user needs to read what is actually lost.
 *
 * INTENT: "refund in myK9 FIRST, never in the Stripe dashboard" is a money
 * instruction, not a preference (MYK9-596). A refund issued from the Stripe
 * dashboard never writes `entries.refund_amount`; only the `stripe-refund-entry`
 * edge function does. `payoutCalc.ts` deducts on `refund_amount` while still
 * counting `payment_status = 'paid'`, so a dashboard refund transfers the club
 * the full amount the platform just refunded out of its own balance. And once
 * the dog is deleted, `RefundEntryDialog` lists live entries only, so the in-app
 * refund is unreachable. Do not shorten either half of that sentence.
 *
 * INTENT: the placement line distinguishes the two kinds of class on purpose.
 * A class myK9 ranks re-derives; a class the secretary placed by hand
 * (`classes.status_source = 'manual'`) is never re-ranked — migration
 * 20260817150000 forbids it — and it is the only case where a restored entry
 * gets its old placement back. Do not flatten this to "placements are
 * recalculated": that is false for exactly the classes a human cared most about.
 *
 * INTENT: the restore line is PARTIAL on purpose (MYK9-596). restore_dog brings
 * back the dog and its entries and nothing else — entry_cart_items and
 * waitlist_entries are hard-deleted by the cascade. Do not shorten this back to
 * "an administrator can restore this": that sentence was wrong, and it was the
 * reason an admin could believe a force delete was free.
 */
export function ForceDeleteOverride({
  checked,
  onCheckedChange,
  disabled = false,
  id = 'force-delete-override',
}: ForceDeleteOverrideProps) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-sm text-foreground">
        Deleting anyway removes the entries along with the dog.{' '}
        <strong>No refund is issued.</strong> Refund any paid entries in myK9 first, using each
        entry&rsquo;s Refund action — once the dog is deleted they can no longer be refunded from
        the app. <strong>Never refund a myK9 entry in the Stripe dashboard:</strong> myK9 does not
        see it, and the club is still paid out in full.
      </p>
      <p className="mt-2 text-sm text-foreground">
        Placements re-derive on their own in classes myK9 ranks. A class the secretary placed by
        hand keeps its placements, and that is the only case where a restored entry gets its old
        placement back.
      </p>
      <div className="mt-3 flex items-start gap-2">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          className="mt-0.5"
        />
        <Label htmlFor={id} className="text-sm font-normal leading-snug cursor-pointer">
          I understand — delete anyway
        </Label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Restoring from Admin → Deleted Items brings back the dog and its entries — not its waitlist
        spots or unsubmitted cart items, which are removed for good. The deletion is recorded for
        the platform team.
      </p>
    </div>
  );
}

export default ForceDeleteOverride;
