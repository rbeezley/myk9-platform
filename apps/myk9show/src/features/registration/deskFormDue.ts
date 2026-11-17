import { supabase } from '@/lib/supabase';
import { formatCartCurrency } from '@/store/cartStore.helpers';

/**
 * MYK9-2149 (owner decision: collect after submit). What an exhibitor's form for a show
 * still owes, in cents, as the server reads it (`desk_form_due_cents`, the same due the
 * submission cap uses): negative when the form holds money beyond what it owes, 0 when
 * there is no form. A fact about the form, not a price. The desk reads it before submit
 * (does the form hold money?) and after (what is still owed?). No client money formula.
 *
 * Online-only desk path (a direct RPC, as other desk money reads are). Any failure is
 * thrown; the desk then keeps its normal step, where anything taken is recorded in full.
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

/**
 * What the desk knows about the form's money on the Payment step. Only `holds` changes the
 * step; `unknown` (not asked), `checking` and `failed` keep the normal one.
 */
export type DeskFormMoney =
  | { status: 'unknown' }
  | { status: 'checking' }
  | { status: 'holds'; heldCents: number }
  | { status: 'none' }
  | { status: 'failed' };

/** The money held, only when a read confirmed it; otherwise null. */
export function heldCentsOf(formMoney: DeskFormMoney | undefined): number | null {
  return formMoney?.status === 'holds' ? formMoney.heldCents : null;
}

export const CHECKING_FORM_MONEY = 'Checking the money on this form...';
export const FORM_MONEY_UNCHECKED = 'Could not check the money already on this form.';

/** What the desk shows after submitting onto a form that held money. */
export interface DeskFormOutcome {
  /** The enrollment id the entry form opens with. */
  formId: string;
  /** Still owed in cents, or null when it could not be read. */
  owedCents: number | null;
}

/** "This form already holds $40.00." */
export function formHoldsLabel(heldCents: number): string {
  return `This form already holds ${formatCartCurrency(heldCents)}.`;
}

export const FORM_HOLDS_HINT = "Submit first. We'll show what is still owed, if anything.";

/** The after-submit sentence for a form that held money. */
export function deskFormOutcomeLabel(owedCents: number | null): string {
  if (owedCents === null) {
    return 'We could not read what is still owed on this form. Open the entry form to check.';
  }
  if (owedCents > 0) {
    return `Still owed on this form: ${formatCartCurrency(owedCents)}. Record it on the entry form when you take it.`;
  }
  return 'Covered by the money already on this form.';
}
