/**
 * The ONE rule for which token an order's receipt may print as its reference.
 *
 * @module services/database/entries/orderReferenceRule
 */

/**
 * The ONE rule for which token an order's receipt may print as its reference.
 *
 * Applied to an entry row on BOTH read paths — the online
 * `view_authenticated_entry_results` read and the offline replica rebuild — so
 * neither can drift into a different answer. Both call THIS function; that is
 * the whole mechanism.
 *
 * The rule is the ENTRY's access, not the enrollment's: the view's
 * `can_view_admin` is true for a show manager, for the entry's handler and for
 * the dog's owner, and it is the only guard on the projected
 * `registration_confirmation_number`. A person whose own entry is on an order
 * therefore gets that order's reference on the receipt listing their own fees —
 * deliberately, on BOTH read paths.
 *
 * The view column WINS over the `registration:registration_id(...)` embed
 * because the embed is a different rule: PostgREST resolves it under
 * `enrollments_select`, whose exhibitor arm matches `enrollments.handler_id`
 * (the person who PLACED the order), not the entry's handler. Two of the live
 * registration-linked entries already differ on that, so leaving the online
 * identifier on the embed would have kept the two paths disagreeing about who
 * may see the same token — the divergence this fix exists to end.
 *
 * The embed is still read for everything else it carries (`payment_status`,
 * `payment_reference`, `paid_amount`), and is the fallback for the reference
 * itself so a database that has not yet received 20260918193700 keeps printing
 * a confirmation number online exactly as it does today.
 *
 * Offline, the same precedence reads: the replicated view column first, the
 * best-effort `enrollments` enrichment (which on the dead show-day network that
 * put us on the replica returns nothing at all) only as the fallback.
 */
export function applyOrderReferenceRule(row: Record<string, unknown>): void {
  const fromView = row['registration_confirmation_number'];
  if (typeof fromView !== 'string' || fromView.length === 0) return;
  const embed = row['registration'];
  const registration: Record<string, unknown> =
    embed && typeof embed === 'object' && !Array.isArray(embed)
      ? { ...(embed as Record<string, unknown>) }
      : { id: (row['registration_id'] as string | null) ?? null };
  registration['confirmation_number'] = fromView;
  row['registration'] = registration;
}
