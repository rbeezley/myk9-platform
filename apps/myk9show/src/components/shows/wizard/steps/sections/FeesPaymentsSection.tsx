import React from 'react';
import { PaymentMethodsCheckboxGroup } from '@/components/common/PaymentMethodsCheckboxGroup';
import type { ShowDraft } from '@/store/wizardStore';
import { FeeField } from '../ShowDetailsStep.FeeField';
import { SectionHeading } from './SectionHeading';

interface FeesPaymentsSectionProps {
  show: ShowDraft;
  onUpdate: (patch: Partial<ShowDraft>) => void;
}

/* ------------------------------------------------------------------ */
/*  Fees & Payments — what it costs and how the club accepts money.    */
/*  The payment-method checkboxes used to be a separate heading; they  */
/*  belong with the fees they modify.                                  */
/* ------------------------------------------------------------------ */

export const FeesPaymentsSection: React.FC<FeesPaymentsSectionProps> = ({ show, onUpdate }) => (
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
