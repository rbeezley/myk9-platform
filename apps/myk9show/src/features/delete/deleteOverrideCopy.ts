/**
 * Every word of the site-admin override form (MYK9-1596). Plain words, the
 * consequence in numbers, no em dashes.
 */
import { formatCurrency } from '@/utils/format';
import { objectNoun, joinWords } from './deleteObjectCopy';
import type { DeleteObjectKind, DeletePreview } from './deleteTypes';

const entries = (n: number) => (n === 1 ? 'entry' : 'entries');

/** "14 paid entries, $420.00 recorded, and 3 scored entries". */
export function overrideConsequence(preview: DeletePreview): string {
  const parts: string[] = [];
  if (preview.paid > 0) {
    parts.push(
      `${preview.paid} paid ${entries(preview.paid)}, ${formatCurrency(preview.paid_amount)} recorded`
    );
  }
  if (preview.scored > 0) {
    parts.push(`${preview.scored} scored ${entries(preview.scored)}`);
  }
  return `Deleting anyway removes ${joinWords(parts)}. No refund is issued.`;
}

/** The online payments that stay captured. Only when some were paid by card with no refund. */
export function stripeWarning(preview: DeletePreview): string {
  const n = preview.stripe_unrefunded;
  return `${n} of these ${entries(n)} ${n === 1 ? 'was' : 'were'} paid online, ${formatCurrency(
    preview.stripe_unrefunded_amount
  )} in all. That money stays captured in Stripe and myK9 does not refund it. Refund these entries in myK9 first if the money should go back, never in the Stripe dashboard.`;
}

export const OVERRIDE_HEADING = 'Delete anyway (site admin)';

export function nameLabel(kind: DeleteObjectKind, name: string): string {
  return `Type the ${objectNoun(kind)} name to confirm: ${name}`;
}

export const AMOUNT_LABEL = 'Type the online payment total to confirm';
export const AMOUNT_HINT = 'For example, 30.00';
export const REASON_LABEL = 'Why are you deleting this?';
export const REASON_HINT = 'Saved in the audit log with your name and the time.';
