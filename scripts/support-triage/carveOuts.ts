import { isPaymentOrRefundQuestion } from '../../supabase/functions/_shared/askq/supportPaymentPolicy.ts';
import type { CarveOutReason, TicketThread } from './types';

// INTENT: These predicates run BEFORE the model is consulted, in plain code.
// A carved-out ticket can only ever produce a draft for the operator to read —
// never an auto-sent reply. Ticket bodies are attacker-controlled input, so this
// gate must never depend on model judgement.
export function carveOutFor(thread: TicketThread): CarveOutReason | null {
  if (thread.ticket.is_show_day_priority) return 'show_day_priority';

  const exhibitorText = [thread.ticket.subject, ...exhibitorBodies(thread)].join('\n');
  if (isPaymentOrRefundQuestion(exhibitorText)) return 'payment_or_refund';

  if (hasRepliedToAnOperatorAnswer(thread)) return 'repeat_question';

  return null;
}

function exhibitorBodies(thread: TicketThread): string[] {
  return thread.messages.filter(message => !message.is_from_operator).map(message => message.body);
}

// The "still doesn't understand" case: the exhibitor has already seen an operator
// reply and come back. Answering again automatically reads as being brushed off.
function hasRepliedToAnOperatorAnswer(thread: TicketThread): boolean {
  const ordered = [...thread.messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const firstOperatorIndex = ordered.findIndex(message => message.is_from_operator);
  if (firstOperatorIndex === -1) return false;
  return ordered.slice(firstOperatorIndex + 1).some(message => !message.is_from_operator);
}
