/**
 * The site-admin override of a blocked show, trial or class delete (MYK9-1596).
 * Pure rules, no React: which objects offer it, and when the typed
 * confirmations are enough to arm it.
 *
 * The dog keeps its own checkbox override (`ForceDeleteOverride`, force_delete_dog).
 * An entry has none: Withdraw or Pull is the path.
 */
import type { DeleteObjectKind, DeletePreview } from './deleteTypes';

const OVERRIDE_KINDS: readonly DeleteObjectKind[] = ['show', 'trial', 'class'];

/** True for the objects whose blocked delete a site admin may override with a reason. */
export function supportsAdminOverride(kind: DeleteObjectKind): boolean {
  return OVERRIDE_KINDS.includes(kind);
}

/** What the admin has typed into the override form. */
export interface OverrideInputs {
  name: string;
  amount: string;
  reason: string;
}

export const EMPTY_OVERRIDE_INPUTS: OverrideInputs = { name: '', amount: '', reason: '' };

/** The reason as the server will receive it: trimmed. Empty means not given. */
export function trimmedReason(reason: string): string {
  return reason.trim();
}

/** True when the typed name is the object's name (spaces and case do not matter). */
export function nameMatches(typed: string, name: string): boolean {
  const wanted = name.trim().toLowerCase();
  return wanted.length > 0 && typed.trim().toLowerCase() === wanted;
}

/** True when the typed dollars equal `dollars` to the cent ("$30", "30.00" and "1,030.5" all parse). */
export function amountMatches(typed: string, dollars: number): boolean {
  const cleaned = typed.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return false;
  return Math.round(Number(cleaned) * 100) === Math.round(dollars * 100);
}

/** Online payments that stay captured: the dialog then also asks for their dollar amount. */
export function needsAmountConfirmation(preview: DeletePreview): boolean {
  return preview.stripe_retained > 0;
}

/**
 * Armed only when the name is typed, the reason is not blank and, if paid
 * online and still holding money after refunds, the dollar amount held is typed.
 */
export function overrideArmedBy(
  inputs: OverrideInputs,
  targetName: string,
  preview: DeletePreview
): boolean {
  if (!nameMatches(inputs.name, targetName)) return false;
  if (trimmedReason(inputs.reason).length === 0) return false;
  if (
    needsAmountConfirmation(preview) &&
    !amountMatches(inputs.amount, preview.stripe_retained_amount)
  ) {
    return false;
  }
  return true;
}
