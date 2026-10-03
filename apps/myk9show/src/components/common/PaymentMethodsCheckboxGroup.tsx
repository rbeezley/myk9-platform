import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ONLINE_ENTRIES_HELP_TEXT } from '@/features/payments/onlineEntryGate';

interface PaymentMethodsCheckboxGroupProps {
  /** MYK9-979: shows.online_entries_enabled. Card payment exists only online. */
  acceptOnline: boolean;
  acceptCheck: boolean;
  acceptCash: boolean;
  onOnlineChange: (checked: boolean) => void;
  onCheckChange: (checked: boolean) => void;
  onCashChange: (checked: boolean) => void;
  idPrefix?: string;
}

/**
 * How a show takes entries and money. Shared by the show creation wizard
 * (FeesPaymentsSection) and the show edit panel (ShowEditFeesTab), so the one
 * "Accept online entries" switch reads the same on both.
 */
export const PaymentMethodsCheckboxGroup: React.FC<PaymentMethodsCheckboxGroupProps> = ({
  acceptOnline,
  acceptCheck,
  acceptCash,
  onOnlineChange,
  onCheckChange,
  onCashChange,
  idPrefix = '',
}) => {
  const onlineId = `${idPrefix}onlineEntriesEnabled`;
  const checkId = `${idPrefix}acceptCheckPayments`;
  const cashId = `${idPrefix}acceptCashPayments`;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
        <Switch
          id={onlineId}
          aria-describedby={`help-${onlineId}`}
          checked={acceptOnline}
          onCheckedChange={onOnlineChange}
          className="mt-0.5"
        />
        <div className="space-y-0.5">
          <Label htmlFor={onlineId} className="cursor-pointer text-sm font-medium">
            Accept online entries (card)
          </Label>
          <p id={`help-${onlineId}`} className="text-xs text-muted-foreground">
            {ONLINE_ENTRIES_HELP_TEXT}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 px-3 py-2 rounded-md">
        <Checkbox
          id={checkId}
          aria-labelledby={`label-${checkId}`}
          checked={acceptCheck}
          onCheckedChange={onCheckChange as (checked: boolean | 'indeterminate') => void}
        />
        <Label
          id={`label-${checkId}`}
          htmlFor={checkId}
          className="text-sm font-medium cursor-pointer"
        >
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
        <Label
          id={`label-${cashId}`}
          htmlFor={cashId}
          className="text-sm font-medium cursor-pointer"
        >
          Cash (pay at show)
        </Label>
      </div>
    </div>
  );
};
