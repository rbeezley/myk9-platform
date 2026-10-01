import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

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
  <div className="flex items-start gap-3 rounded-lg border border-border p-3">
    <Checkbox
      id="charge-junior-fee"
      checked={checked}
      onCheckedChange={value => onCheckedChange(value === true)}
    />
    <div className="space-y-1">
      <Label htmlFor="charge-junior-fee">Charge junior handler fee (${fee.toFixed(2)})</Label>
      <p className="text-xs text-muted-foreground">
        Applies to every entry you are adding now. Use it when the handler is a junior. Your name is
        recorded against the fee.
      </p>
    </div>
  </div>
);
