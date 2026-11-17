import { supabase } from '@/lib/supabase';
import { formatCartCurrency } from '@/store/cartStore.helpers';

/**
 * MYK9-2149 (owner decision: inform only). What an exhibitor's form for a show still owes, in
 * cents, as the server reads it (`desk_form_due_cents`): negative when the form holds money
 * beyond what it owes, 0 when there is no form. The desk only SAYS so: a banner on the payment
 * step before submit, and what is still owed after. Neither changes a choice or the submit,
 * and money taken is always recorded in full. No client money formula.
 */
export async function fetchDeskFormDueCents(showId: string, handlerId: string): Promise<number> {
  // Until the generated types are refreshed after the migration is pushed.
  const { data, error } = await supabase.rpc(
    'desk_form_due_cents' as never,
    { p_show_id: showId, p_handler_id: handlerId } as never
  );
  if (error) throw error;
  const due = Number(data);
  if (!Number.isFinite(due)) throw new Error('desk_form_due_cents returned no amount');
  return due;
}

/** The money a form holds beyond what it owes, from its due; 0 when it holds none. */
export function heldCentsFromDue(dueCents: number): number {
  return dueCents < 0 ? -dueCents : 0;
}

/** The payment step's banner when a confirmed read says the form holds money. */
export function formHoldsBannerLabel(heldCents: number): string {
  return `This form already holds ${formatCartCurrency(heldCents)}. To use it, choose 'Use the money already on this form'. Record anything still owed on the entry form after submitting.`;
}

/** What the desk shows after submitting onto a form that held money. */
export interface DeskFormOutcome {
  /** The enrollment id the entry form opens with. */
  formId: string;
  /** Still owed in cents, or null when it could not be read. */
  owedCents: number | null;
}

/** The after-submit sentence for a form that held money. */
export function deskFormOutcomeLabel(owedCents: number | null): string {
  if (owedCents === null) {
    return 'Could not check what is owed on this form. Open the entry form to check.';
  }
  if (owedCents > 0) {
    return `Still owed on this form: ${formatCartCurrency(owedCents)}. Record it on the entry form when you take it.`;
  }
  return 'Nothing is owed on this form now.';
}
