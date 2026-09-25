/**
 * Pure helpers for the class-level "Results Posted" push (MYK9-737).
 *
 * The classes trigger (trg_notify_class_results_push) posts here once per
 * class, at the moment private.claim_class_results_push finds the class done
 * and its qualification results visible. The handler re-reads visibility from
 * public.resolve_class_result_visibility before sending, so a class that was
 * un-released in the meantime still does not announce anything.
 */

export interface ResultsPushTarget {
  classId: string;
  className: string | null;
}

interface AuthLink {
  auth_user_id?: string | null;
}

export interface ScoredEntryAudienceRow {
  dog?: {
    call_name?: string | null;
    owner?: AuthLink | null;
    co_owner?: AuthLink | null;
  } | null;
  handler?: AuthLink | null;
}

export interface ResultsPushPayload {
  type: 'results_posted';
  title: string;
  body: string;
  priority: 'normal';
}

/** The class the trigger announced, or null for anything else. */
export function parseResultsPushPayload(payload: unknown): ResultsPushTarget | null {
  const body = payload as { table?: unknown; record?: { id?: unknown; name?: unknown } } | null;
  if (body?.table !== 'classes') return null;
  const id = body.record?.id;
  if (typeof id !== 'string' || id === '') return null;
  const name = body.record?.name;
  return { classId: id, className: typeof name === 'string' && name !== '' ? name : null };
}

/**
 * True only when the resolver's single row says qualification is visible.
 * Any other shape is treated as held: announcing results early is the bug.
 */
export function resultsAreVisible(rows: unknown): boolean {
  if (!Array.isArray(rows) || rows.length !== 1) return false;
  return (rows[0] as { qualification_visible?: unknown } | null)?.qualification_visible === true;
}

/** Auth user id → that person's scored dogs in the class, in entry order, once each. */
export function groupResultsRecipients(
  entries: readonly ScoredEntryAudienceRow[]
): Map<string, string[]> {
  const recipients = new Map<string, string[]>();
  for (const entry of entries) {
    const dogName = entry.dog?.call_name || 'Your dog';
    const audience = [
      entry.dog?.owner?.auth_user_id,
      entry.dog?.co_owner?.auth_user_id,
      entry.handler?.auth_user_id,
    ];
    for (const authUserId of new Set(audience)) {
      if (!authUserId) continue;
      const dogs = recipients.get(authUserId) ?? [];
      if (!dogs.includes(dogName)) dogs.push(dogName);
      recipients.set(authUserId, dogs);
    }
  }
  return recipients;
}

export function buildResultsPushPayload(
  dogNames: readonly string[],
  className: string | null
): ResultsPushPayload {
  return {
    type: 'results_posted',
    title: 'Results Posted',
    body: `${dogNames.join(', ')} — ${className ?? 'a class'}`,
    priority: 'normal',
  };
}
