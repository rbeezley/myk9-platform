import {
  decideEntryPaymentAutoRefund,
  type EntryPaymentAutoRefundDecision,
} from './entryPaymentAutoRefund.ts';
import { INACTIVE_ENTRY_STATUSES } from './entryPaymentReconcile.ts';

export interface EntryPaymentNoOpRow {
  id: string;
  payment_status: string | null;
  entry_status: string | null;
  stripe_payment_intent_id?: string | null;
}

export interface ReconcileEntryPaymentUpdateOutcomeInput {
  plannedPatchIds: string[];
  updatedEntryIds: string[];
  rereadNoOpEntries: EntryPaymentNoOpRow[];
  initialMissingEntryIds: string[];
  initialInactiveEntryIds: string[];
  initialAlreadyPaidEntryIds: string[];
  initialSameIntentPaidEntryIds: string[];
  paymentIntentId: string | null;
  sessionAmountTotalCents: number | null;
  entryFeesById: Map<string, number>;
}

export interface ReconcileEntryPaymentUpdateOutcomeResult {
  paidEntryIds: string[];
  noOpPatchIds: string[];
  missingEntryIds: string[];
  inactiveEntryIds: string[];
  alreadyPaidEntryIds: string[];
  sameIntentPaidEntryIds: string[];
  unknownNoOpEntryIds: string[];
  invalidEntryIds: string[];
  refundDecision: EntryPaymentAutoRefundDecision;
}

export function reconcileEntryPaymentUpdateOutcome(
  input: ReconcileEntryPaymentUpdateOutcomeInput
): ReconcileEntryPaymentUpdateOutcomeResult {
  const updated = new Set(input.updatedEntryIds);
  const rereadById = new Map(input.rereadNoOpEntries.map(entry => [entry.id, entry]));
  const noOpPatchIds = input.plannedPatchIds.filter(id => !updated.has(id));

  const missingFromNoOp: string[] = [];
  const inactiveFromNoOp: string[] = [];
  const alreadyPaidFromNoOp: string[] = [];
  const sameIntentPaidFromNoOp: string[] = [];
  const unknownNoOpEntryIds: string[] = [];

  for (const id of noOpPatchIds) {
    const entry = rereadById.get(id);
    if (!entry) {
      missingFromNoOp.push(id);
    } else if (
      entry.payment_status === 'paid' &&
      input.paymentIntentId &&
      entry.stripe_payment_intent_id === input.paymentIntentId
    ) {
      sameIntentPaidFromNoOp.push(id);
    } else if (entry.payment_status === 'paid') {
      alreadyPaidFromNoOp.push(id);
    } else if (INACTIVE_ENTRY_STATUSES.has(entry.entry_status ?? '')) {
      inactiveFromNoOp.push(id);
    } else {
      unknownNoOpEntryIds.push(id);
    }
  }

  const missingEntryIds = unique([...input.initialMissingEntryIds, ...missingFromNoOp]);
  const inactiveEntryIds = unique([...input.initialInactiveEntryIds, ...inactiveFromNoOp]);
  const alreadyPaidEntryIds = unique([...input.initialAlreadyPaidEntryIds, ...alreadyPaidFromNoOp]);
  const sameIntentPaidEntryIds = unique([
    ...input.initialSameIntentPaidEntryIds,
    ...sameIntentPaidFromNoOp,
  ]);
  const invalidEntryIds = unique([
    ...missingEntryIds,
    ...inactiveEntryIds,
    ...alreadyPaidEntryIds,
    ...unknownNoOpEntryIds,
  ]);
  const paidEntryIds = unique([
    ...input.plannedPatchIds.filter(id => updated.has(id)),
    ...sameIntentPaidEntryIds,
  ]);

  return {
    paidEntryIds,
    noOpPatchIds,
    missingEntryIds,
    inactiveEntryIds,
    alreadyPaidEntryIds,
    sameIntentPaidEntryIds,
    unknownNoOpEntryIds,
    invalidEntryIds,
    refundDecision: decideEntryPaymentAutoRefund({
      paymentIntentId: input.paymentIntentId,
      sessionAmountTotalCents: input.sessionAmountTotalCents,
      validPaidEntryIds: paidEntryIds,
      invalidEntryIds,
      entryFeesById: input.entryFeesById,
    }),
  };
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}
