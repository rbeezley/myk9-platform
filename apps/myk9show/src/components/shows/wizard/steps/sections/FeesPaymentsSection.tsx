import React from 'react';
import { PaymentMethodsCheckboxGroup } from '@/components/common/PaymentMethodsCheckboxGroup';
import type { ShowDraft } from '@/store/wizardStore';
import { FeeField } from '../ShowDetailsStep.FeeField';
import { SectionHeading } from './SectionHeading';

interface FeesPaymentsSectionProps {
  show: ShowDraft;
  onUpdate: (patch: Partial<ShowDraft>) => void;
  /**
   * False when the wizard is adding to an existing show: the fee is edited on the show edit
   * panel, and a draft that carries none writes nothing, so it can neither set nor clear one.
   */
  juniorHandlerFeeEditable?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Fees & Payments — what it costs and how the club accepts money.    */
/*  The payment-method checkboxes used to be a separate heading; they  */
/*  belong with the fees they modify.                                  */
/* ------------------------------------------------------------------ */

export const FeesPaymentsSection: React.FC<FeesPaymentsSectionProps> = ({
  show,
  onUpdate,
  juniorHandlerFeeEditable = true,
}) => (
  <div>
    <SectionHeading>Fees &amp; Payments</SectionHeading>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FeeField
        id="show-pre-entry-fee"
        label="Pre-Entry Fee"
        tooltip="Entry fee for registrations submitted before the entry close date. Usually lower than day-of-show fee."
        value={show.preEntryFee}
        onChange={v => {
          if (v !== undefined) onUpdate({ preEntryFee: v });
        }}
      />

      <FeeField
        id="show-day-of-show-fee"
        label="Day-of-Show Fee"
        tooltip="Entry fee for on-site registrations on the day of the show. Usually higher than pre-entry fee."
        value={show.dayOfShowFee}
        onChange={v => {
          if (v !== undefined) onUpdate({ dayOfShowFee: v });
        }}
      />

      {juniorHandlerFeeEditable && show.organization !== 'ASCA' && (
        <FeeField
          id="show-junior-handler-fee"
          label="Junior Handler Fee"
          tooltip="Reduced entry fee for a junior handler (under 18). Leave blank or $0 for no junior fee. Shown on the entry blank; it does not change any entry's price yet."
          value={show.juniorHandlerFee}
          onChange={v => {
            if (v !== undefined) onUpdate({ juniorHandlerFee: v });
          }}
        />
      )}

      <div className="md:col-span-2">
        <PaymentMethodsCheckboxGroup
          acceptCheck={show.acceptCheckPayments ?? false}
          acceptCash={show.acceptCashPayments ?? false}
          onCheckChange={checked => onUpdate({ acceptCheckPayments: checked })}
          onCashChange={checked => onUpdate({ acceptCashPayments: checked })}
        />
      </div>
    </div>
  </div>
);
