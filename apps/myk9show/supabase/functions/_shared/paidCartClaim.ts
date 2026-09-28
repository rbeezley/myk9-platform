// A submitted cart is a claim, not evidence that every paid entry was made.
// The Edge worker can crash after the claim. Wait longer than one worker run
// before reclaiming, then use the frozen Session snapshot to resume.
export const CLAIM_LEASE_MS = 15 * 60 * 1000;

interface SubmittedCartRecoveryInput {
  paidSessionId: string;
  cartSessionId: string | null;
  cartUpdatedAt: string | null;
  nowIso: string;
}

export type SubmittedCartRecoveryDecision =
  { action: 'retry' } | { action: 'reclaim' } | { action: 'refund' };

export function decideSubmittedCartRecovery(
  input: SubmittedCartRecoveryInput
): SubmittedCartRecoveryDecision {
  if (input.cartSessionId !== input.paidSessionId) return { action: 'refund' };
  if (
    !input.cartUpdatedAt ||
    Date.parse(input.nowIso) - Date.parse(input.cartUpdatedAt) < CLAIM_LEASE_MS
  ) {
    return { action: 'retry' };
  }
  return { action: 'reclaim' };
}

interface RecoveryDeps {
  orderExists: () => Promise<boolean>;
  intentHasEntries: () => Promise<boolean>;
  alertPartial: () => Promise<void>;
  refundDuplicate: () => Promise<void>;
  releaseStaleClaim: (cutoffIso: string) => Promise<boolean>;
}

/** Run the paid redelivery decision, including side effects, once per claim. */
export async function recoverSubmittedCart(
  input: SubmittedCartRecoveryInput,
  deps: RecoveryDeps
): Promise<'handled' | 'resume'> {
  if (await deps.orderExists()) return 'handled';
  if (await deps.intentHasEntries()) {
    await deps.alertPartial();
    return 'handled';
  }
  const decision = decideSubmittedCartRecovery(input);
  if (decision.action === 'refund') {
    await deps.refundDuplicate();
    return 'handled';
  }
  if (decision.action === 'retry') {
    throw new Error(`Paid cart for ${input.paidSessionId} is still claimed; retry later`);
  }
  const cutoffIso = new Date(Date.parse(input.nowIso) - CLAIM_LEASE_MS).toISOString();
  if (!(await deps.releaseStaleClaim(cutoffIso))) {
    throw new Error(`Paid cart for ${input.paidSessionId} claim changed during recovery`);
  }
  return 'resume';
}
