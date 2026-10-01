import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';

interface JuniorFeeChoiceProps {
  /** The show's junior handler fee, in dollars. */
  fee: number;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * MYK9-878: the show secretary's explicit choice to charge the junior handler
 * fee on the entries being added. It is the ONLY way slice B charges the junior
 * fee: a fee choice the secretary makes, never derived from age or ownership.
 */
export const JuniorFeeChoice: React.FC<JuniorFeeChoiceProps> = ({
  fee,
  checked,
  onCheckedChange,
}) => (
  // The WHOLE padded row is the label, so the hit area is the row (>= 44px high, the
  // show-desk tablet floor in docs/INTENT.md), never the 16px painted checkbox.
  <label
    htmlFor="charge-junior-fee"
    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
  >
    <Checkbox
      id="charge-junior-fee"
      checked={checked}
      onCheckedChange={value => onCheckedChange(value === true)}
      className="mt-0.5"
    />
    <span className="space-y-1">
      <span className="block text-sm font-medium">
        Charge junior handler fee (${fee.toFixed(2)})
      </span>
      <span className="block text-xs text-muted-foreground">
        Applies to every entry you are adding now. Use it when the handler is a junior. Your name is
        recorded against the fee.
      </span>
    </span>
  </label>
);
