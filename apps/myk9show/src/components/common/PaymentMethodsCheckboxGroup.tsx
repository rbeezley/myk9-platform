import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface PaymentMethodsCheckboxGroupProps {
  acceptCheck: boolean;
  acceptCash: boolean;
  onCheckChange: (checked: boolean) => void;
  onCashChange: (checked: boolean) => void;
  idPrefix?: string;
}

export const PaymentMethodsCheckboxGroup: React.FC<PaymentMethodsCheckboxGroupProps> = ({
  acceptCheck,
  acceptCash,
  onCheckChange,
  onCashChange,
  idPrefix = '',
}) => {
  const checkId = `${idPrefix}acceptCheckPayments`;
  const cashId = `${idPrefix}acceptCashPayments`;
  const lockedId = `${idPrefix}credit_card_locked`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-primary/5 border border-primary/20">
        <Checkbox id={lockedId} checked disabled />
        <Label
          htmlFor={lockedId}
          className="text-sm font-medium text-muted-foreground cursor-default"
        >
          Credit/Debit Card — always enabled
        </Label>
      </div>
      <div className="flex items-center gap-3 px-3 py-2 rounded-md">
        <Checkbox
          id={checkId}
          aria-labelledby={`label-${checkId}`}
          checked={acceptCheck}
          onCheckedChange={onCheckChange as (checked: boolean | 'indeterminate') => void}
        />
        <Label id={`label-${checkId}`} htmlFor={checkId} className="text-sm font-medium cursor-pointer">
          Check (pay at show)
        </Label>
      </div>
      <div className="flex items-center gap-3 px-3 py-2 rounded-md">
        <Checkbox
          id={cashId}
          aria-labelledby={`label-${cashId}`}
          checked={acceptCash}
          onCheckedChange={onCashChange as (checked: boolean | 'indeterminate') => void}
        />
        <Label id={`label-${cashId}`} htmlFor={cashId} className="text-sm font-medium cursor-pointer">
          Cash (pay at show)
        </Label>
      </div>
    </div>
  );
};
