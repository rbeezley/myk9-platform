/**
 * MYK9-1978: the exhibitor's class change request, from the app.
 *
 * Two SECURITY DEFINER functions (migration 20261114201300) own the writes:
 * `request_own_entry_class_change` and `cancel_own_entry_class_change`. Both are
 * ONLINE ONLY by design. They are awaited and never queued through the mutation
 * manager, because a request the server refused must not look sent. The read of
 * the stored target and reason is a direct, online read for the same reason: the
 * entry-results views the replica is built from do not carry those columns, and
 * a request can only be made, answered or taken back online.
 *
 * Nothing here moves an entry or any money. Accepting is the secretary's act.
 */
import { supabase } from '../supabaseClient';

export const CLASS_CHANGE_REASONS = ['finished_level', 'wrong_level', 'wrong_section'] as const;
export type ClassChangeReason = (typeof CLASS_CHANGE_REASONS)[number];

/** The reason, in the words an exhibitor and a secretary both read. */
export const CLASS_CHANGE_REASON_LABELS: Record<ClassChangeReason, string> = {
  finished_level: 'Finished this level',
  wrong_level: 'Entered the wrong level',
  wrong_section: 'Wrong section',
};

/** The reason as it reads in a sentence after "Reason:". */
export function classChangeReasonLabel(reason: string | null | undefined): string | null {
  return reason && reason in CLASS_CHANGE_REASON_LABELS
    ? CLASS_CHANGE_REASON_LABELS[reason as ClassChangeReason]
    : null;
}

export interface ClassChangeFailure {
  code?: string | undefined;
  hint?: string | undefined;
  message?: string | undefined;
}

export interface ClassChangeResult {
  error: ClassChangeFailure | null;
}

export async function requestClassChange(input: {
  entryId: string;
  targetClassId: string;
  reason: ClassChangeReason;
}): Promise<ClassChangeResult> {
  const { error } = await supabase.rpc('request_own_entry_class_change', {
    p_entry_id: input.entryId,
    p_target_class_id: input.targetClassId,
    p_reason: input.reason,
  });
  return { error: error ?? null };
}

export async function cancelClassChange(entryId: string): Promise<ClassChangeResult> {
  const { error } = await supabase.rpc('cancel_own_entry_class_change', {
    p_entry_id: entryId,
  });
  return { error: error ?? null };
}

export interface ClassChangeRequestDetails {
  entryId: string;
  targetClassId: string | null;
  reason: string | null;
  requestedAt: string | null;
}

/**
 * The stored target class, reason and time for each entry that has a waiting
 * request. Throws on a read failure: an unread request is not "no target".
 */
export async function getClassChangeRequestDetails(
  entryIds: readonly string[]
): Promise<Record<string, ClassChangeRequestDetails>> {
  if (entryIds.length === 0) return {};
  const { data, error } = await supabase
    .from('entries')
    .select('id, class_change_target_class_id, class_change_reason, class_change_requested_at')
    .in('id', [...entryIds]);
  if (error) throw error;
  return Object.fromEntries(
    (data ?? []).map(row => [
      row.id,
      {
        entryId: row.id,
        targetClassId: row.class_change_target_class_id,
        reason: row.class_change_reason,
        requestedAt: row.class_change_requested_at,
      },
    ])
  );
}

/** A class's display name by id, for the line that names the class asked for. */
export async function getClassNamesByIds(
  classIds: readonly string[]
): Promise<Record<string, string>> {
  if (classIds.length === 0) return {};
  const { data, error } = await supabase
    .from('classes')
    .select('id, name')
    .in('id', [...classIds]);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map(row => [row.id, row.name]));
}
