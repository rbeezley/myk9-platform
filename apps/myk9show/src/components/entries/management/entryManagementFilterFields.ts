/**
 * `ListFilterBar` field definitions for the registration-queue views
 * (MYK9-795) — replaces `TrialClassFilters` (trial + class) and adds the new
 * payment-status filter. `payment_status` already exists on
 * `EntryManagementEntry`; no new query.
 */
import { formatTrialLabel } from '@myk9/core';
import type { ListFilterField } from '@/components/list-toolkit';
import { PaymentStatus } from '@/types/show-registration-types';
import type {
  EntryManagementTrial,
  EntryManagementTrialClass,
} from '@/hooks/useEntryManagementTrialScope';
import type { EntryManagementCockpitState } from './entryManagementCockpitParams';

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: 'Pending',
  [PaymentStatus.PAID_ONLINE]: 'Paid online',
  [PaymentStatus.PAID_BY_CHECK]: 'Paid by check',
  [PaymentStatus.PAID_BY_CASH]: 'Paid by cash',
  [PaymentStatus.REFUNDED]: 'Refunded',
  [PaymentStatus.PARTIAL_REFUND]: 'Partially refunded',
  [PaymentStatus.WAIVED]: 'Waived',
};

function formatTrialOptionLabel(trial: EntryManagementTrial): string {
  const label = formatTrialLabel({ name: trial.name, trialNumber: trial.trial_number });
  if (!trial.date) return label;
  const date = new Date(`${trial.date}T00:00:00`);
  const formatted = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${label} · ${formatted}`;
}

export interface BuildEntryManagementFilterFieldsOptions {
  state: EntryManagementCockpitState;
  trials: readonly EntryManagementTrial[];
  trialClasses: readonly EntryManagementTrialClass[];
  onScopeChange: (trialId: string | null, classId?: string | null) => void;
  onPaymentStatusChange: (status: PaymentStatus | null) => void;
}

export function buildEntryManagementFilterFields({
  state,
  trials,
  trialClasses,
  onScopeChange,
  onPaymentStatusChange,
}: BuildEntryManagementFilterFieldsOptions): ListFilterField[] {
  return [
    {
      kind: 'options',
      key: 'trial',
      label: 'Trial',
      value: state.trialId,
      onChange: trialId => onScopeChange(trialId, null),
      options: trials.map(trial => ({ value: trial.id, label: formatTrialOptionLabel(trial) })),
    },
    {
      kind: 'options',
      key: 'class',
      label: 'Class',
      // `trialClasses` is already scoped to `state.trialId` by
      // `useEntryManagementTrialClasses` (empty when no trial is selected), so
      // this field naturally has nothing to offer until a trial is picked —
      // the same effective gating `TrialClassFilters`' `disabled` prop gave,
      // without the list-toolkit needing a per-field disabled concept.
      value: state.classId,
      onChange: classId => onScopeChange(state.trialId, classId),
      options: trialClasses.map(entryClass => ({
        value: entryClass.id,
        label: entryClass.name ?? 'Unnamed class',
      })),
    },
    {
      kind: 'options',
      key: 'payment',
      label: 'Payment status',
      value: state.paymentStatus,
      onChange: value => onPaymentStatusChange(value as PaymentStatus | null),
      options: Object.values(PaymentStatus).map(status => ({
        value: status,
        label: PAYMENT_STATUS_LABELS[status],
      })),
    },
  ];
}
