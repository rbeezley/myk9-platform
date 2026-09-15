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
        Deleting anyway removes the entries along with the dog. <strong>No refund is issued</strong>{' '}
        — any payment stays captured, and removing a scored entry re-calculates placements for the
        rest of its class.
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
        An administrator can restore this from Admin → Deleted Items.
      </p>
    </div>
  );
}

export default ForceDeleteOverride;
