/**
 * The site-admin override form for a blocked show, trial or class delete
 * (MYK9-1596). Shown by `DeleteObjectDialog` only to a site admin, only when the
 * server's preview says the delete is blocked, and only for one object.
 *
 * INTENT: this is deliberate friction, like `ForceDeleteOverride`. The consequence
 * is stated in numbers above the inputs, the object's name must be typed, a
 * reason is required, and money still captured in Stripe must be acknowledged
 * by typing its total. Do not collapse it into a checkbox or a one-click button.
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { needsAmountConfirmation, type OverrideInputs } from './deleteOverride';
import {
  AMOUNT_HINT,
  AMOUNT_LABEL,
  nameLabel,
  OVERRIDE_HEADING,
  overrideConsequence,
  REASON_HINT,
  REASON_LABEL,
  stripeWarning,
} from './deleteOverrideCopy';
import type { DeleteObjectKind, DeletePreview } from './deleteTypes';

interface DeleteOverrideControlProps {
  kind: DeleteObjectKind;
  targetName: string;
  preview: DeletePreview;
  inputs: OverrideInputs;
  onChange: (inputs: OverrideInputs) => void;
  disabled?: boolean;
}

export function DeleteOverrideControl({
  kind,
  targetName,
  preview,
  inputs,
  onChange,
  disabled = false,
}: DeleteOverrideControlProps) {
  const needsAmount = needsAmountConfirmation(preview);
  const set = (patch: Partial<OverrideInputs>) => onChange({ ...inputs, ...patch });

  return (
    <div
      className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3"
      data-testid="delete-override"
    >
      <p className="text-sm font-semibold text-foreground">{OVERRIDE_HEADING}</p>
      <p className="text-sm text-foreground" data-testid="delete-override-consequence">
        {overrideConsequence(preview)}
      </p>
      {needsAmount && (
        <p className="text-sm font-medium text-foreground" data-testid="delete-override-stripe">
          {stripeWarning(preview)}
        </p>
      )}

      <div className="space-y-1">
        <Label htmlFor="delete-override-reason" className="text-sm">
          {REASON_LABEL}
        </Label>
        <Textarea
          id="delete-override-reason"
          value={inputs.reason}
          onChange={event => set({ reason: event.target.value })}
          disabled={disabled}
          rows={2}
        />
        <p className="text-xs text-muted-foreground">{REASON_HINT}</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="delete-override-name" className="text-sm">
          {nameLabel(kind, targetName)}
        </Label>
        <Input
          id="delete-override-name"
          value={inputs.name}
          onChange={event => set({ name: event.target.value })}
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      {needsAmount && (
        <div className="space-y-1">
          <Label htmlFor="delete-override-amount" className="text-sm">
            {AMOUNT_LABEL}
          </Label>
          <Input
            id="delete-override-amount"
            value={inputs.amount}
            onChange={event => set({ amount: event.target.value })}
            disabled={disabled}
            inputMode="decimal"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">{AMOUNT_HINT}</p>
        </div>
      )}
    </div>
  );
}

export default DeleteOverrideControl;
