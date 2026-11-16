export type SupportEscalationReason = 'payment_or_refund' | 'low_confidence';

/** The handoff to a person: the note the ticket step opens with. */
export interface SupportDeflectionRoute {
  kind: 'escalate';
  reason: SupportEscalationReason;
  message: string;
  question: string;
}
