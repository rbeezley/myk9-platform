/**
 * Row mappers for the Deleted Items (trash) tab: raw query rows in, the one
 * DeletedEntity shape the section list renders out.
 */

import { formatPlacement } from '@/components/classes/ClassResultsTable/utils';
import type { RestoreDogResult } from '@/services/database/dogs';
import type { DeletedEntity } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export const mapShow = (row: Row): DeletedEntity => ({
  id: row.id,
  name: row.name || 'Unnamed Show',
  deleted_at: row.deleted_at,
  deleted_by_email: row.deleted_by_user?.email ?? null,
});

export const mapTrial = (row: Row): DeletedEntity => ({
  id: row.id,
  name: row.name || 'Unnamed Trial',
  context: row.show?.name ? `Show: ${row.show.name}` : undefined,
  deleted_at: row.deleted_at,
  deleted_by_email: row.deleted_by_user?.email ?? null,
});

export const mapClass = (row: Row): DeletedEntity => ({
  id: row.id,
  name: row.name || 'Unnamed Class',
  context: row.trial?.name ? `Trial: ${row.trial.name}` : undefined,
  deleted_at: row.deleted_at,
  deleted_by_email: row.deleted_by_user?.email ?? null,
});

export const mapEntry = (row: Row): DeletedEntity => ({
  id: row.id,
  name: `${row.dog?.call_name ?? row.dog?.name ?? 'Unknown Dog'} → ${row.class?.name ?? 'Unknown Class'}`,
  context: row.class?.name,
  deleted_at: row.deleted_at,
  deleted_by_email: row.deleted_by_user?.email ?? null,
});

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v !== '') : [];

/** "Name (email)", either half alone, or null — rows deleted before
 *  `deleted_by` was stamped carry neither (MYK9-608). */
export function formatDeleter(name: unknown, email: unknown): string | null {
  const n = typeof name === 'string' && name.trim() ? name.trim() : null;
  const e = typeof email === 'string' && email.trim() ? email.trim() : null;
  if (n && e) return `${n} (${e})`;
  return n ?? e;
}

const asAmount = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const dollars = (n: number) => `$${n.toFixed(2)}`;

/**
 * One recorded payment, as the entry row held it at delete time: "pi_x: $35.00
 * paid", "pi_x: $35.00 paid, $10.00 refunded", "pi_x: $35.00 paid, refunded in
 * full". A statement of what was recorded, never of what is owed (MYK9-608).
 */
export function describeRecordedPayment(payment: unknown): string | null {
  if (payment === null || typeof payment !== 'object' || Array.isArray(payment)) return null;
  const p = payment as Record<string, unknown>;
  const intent = typeof p.stripe_payment_intent_id === 'string' ? p.stripe_payment_intent_id : '';
  if (!intent) return null;

  const status = typeof p.payment_status === 'string' ? p.payment_status : null;
  const fee = asAmount(p.entry_fee);
  const refunded = asAmount(p.refund_amount);

  if (status !== 'paid' && status !== 'refunded') {
    return `${intent}: ${fee !== null ? `${dollars(fee)}, ` : ''}status ${status ?? 'not recorded'}`;
  }
  const parts = [fee !== null ? `${dollars(fee)} paid` : 'paid (fee not recorded)'];
  if (refunded !== null && refunded > 0) {
    parts.push(
      fee !== null && refunded === fee ? 'refunded in full' : `${dollars(refunded)} refunded`
    );
  } else if (status === 'refunded') {
    parts.push('marked refunded, no amount recorded');
  }
  return `${intent}: ${parts.join(', ')}`;
}

/**
 * The facts `get_deleted_dogs()` carries for a FORCE-deleted dog (MYK9-608):
 * who overrode the paid/scored guard, which entries went with the dog, and
 * every entry's payment exactly as recorded at delete time. An ordinary delete
 * has no audit object and no lines.
 *
 * DECISION: facts, not a verdict. Nothing here decides what is still owed — a
 * full and a partial in-app refund both read payment_status 'refunded', and the
 * one netting rule lives in payoutCalc. The admin reads the recorded amounts.
 *
 * INTENT: the recovery line says restore-then-refund-in-myK9, and never the
 * Stripe dashboard. A dashboard refund writes no refund_amount, so the club is
 * still paid out in full — the same warning ForceDeleteOverride gives.
 */
export function describeForceDeleteAudit(audit: unknown): string[] | undefined {
  if (audit === null || typeof audit !== 'object' || Array.isArray(audit)) return undefined;
  const a = audit as Record<string, unknown>;
  const actor = typeof a.actor_name === 'string' && a.actor_name.trim() ? a.actor_name : 'an admin';
  const entryIds = stringList(a.entry_ids);
  const payments = (Array.isArray(a.payments) ? a.payments : [])
    .map(describeRecordedPayment)
    .filter((line): line is string => line !== null);

  const lines = [
    `Force-deleted over the paid/scored guard by ${actor}. The override issued no refund.`,
  ];
  if (entryIds.length > 0) {
    lines.push(`Entries removed (${entryIds.length}): ${entryIds.join(', ')}`);
  }
  if (payments.length > 0) {
    lines.push(`Payments recorded at delete: ${payments.join('; ')}.`);
    lines.push(
      'To refund, restore the dog, then refund in myK9 as needed — never in the Stripe dashboard.'
    );
  }
  return lines;
}

export const mapDog = (row: Row): DeletedEntity => ({
  id: row.id,
  name: row.name || 'Unnamed Dog',
  context: row.breed,
  deleted_at: row.deleted_at,
  deleted_by_email: formatDeleter(row.deleted_by_name, row.deleted_by_email),
  details: describeForceDeleteAudit(row.force_delete_audit),
});

export const mapClub = (row: Row): DeletedEntity => ({
  id: row.id,
  name: row.name || 'Unnamed Club',
  deleted_at: row.deleted_at,
  deleted_by_email: row.deleted_by_user?.email ?? null,
});

export const mapPerson = (row: Row): DeletedEntity => ({
  id: row.id,
  name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Unnamed Person',
  context: row.email,
  deleted_at: row.deleted_at,
  deleted_by_email: row.deleted_by_user?.email ?? null,
});

/**
 * The warning to show after a dog restore that could not give every
 * placement back (MYK9-607), or null when there is nothing to say.
 */
export function describeRestoreDog(result: unknown): string | null {
  const data = (result as { data?: RestoreDogResult | null } | null | undefined)?.data;
  const skipped = data?.placementsSkipped ?? [];
  if (skipped.length === 0) return null;

  const list = skipped
    .map(s => `${formatPlacement(s.finalPlacement)} in ${s.className ?? 'a class'}`)
    .join('; ');
  const one = skipped.length === 1;
  return (
    `Dog restored, but ${one ? 'one placement was' : `${skipped.length} placements were`} not ` +
    `given back because another dog now holds ${one ? 'it' : 'them'}: ${list}. ` +
    `Ask the secretary to re-check ${one ? 'that class' : 'those classes'}.`
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryFn = () => Promise<{ data: any[]; error: any } | any>;

/** Some query fns return { data, error }, others the raw Supabase response,
 *  which has the same shape. */
export const fetchAndMap = async (
  queryFn: QueryFn,
  mapper: (row: Row) => DeletedEntity
): Promise<DeletedEntity[]> => {
  const result = await queryFn();
  const rows = result?.data ?? [];
  return rows.map(mapper);
};
