/**
 * MYK9-2031: dogs that share one handler in the same class, derived from the entries the Results
 * tab already reads. Nothing is stored: the wizard's "Decide at the show" saves the owner as
 * every dog's handler, so one person handling two dogs in a class is the trace it leaves. The
 * marked catalog names the handler when it differs from the owner (AKC Scent Work Regulations
 * ch. 3 sec. 36), so the secretary settles these first with Change handler on the entry. The
 * clash clears itself once one of the dogs names someone else.
 *
 * "Live" is the Results rows' rule: `isExpectedEntry` (not withdrawn, pulled, moved or deleted)
 * and not still pending acceptance. An entry with no class,
 * or with no handler person on the row, cannot clash and is skipped. `undefined` is "unknown",
 * never 0: a live entry whose row does not carry `handler_id` at all means the read cannot say.
 */
import { isExpectedEntry } from '@/features/_shared/entryAccounting';
import { isPendingEntryStatus } from '@/features/entry-operations/classEntryBreakdown';
import type { WhatIsLeftInput } from './whatIsLeft';

export interface HandlerClashEntry {
  class_id?: string | null | undefined;
  /** `undefined` = this read does not carry the column; `null` = no handler person on the row. */
  handler_id?: string | null | undefined;
  entry_status?: string | null | undefined;
  check_in_status?: string | null | undefined;
  deleted_at?: string | null | undefined;
}

export function readHandlerClashes(
  entries: readonly HandlerClashEntry[]
): WhatIsLeftInput['handlerClashes'] {
  const live = entries.filter(
    entry =>
      !!entry.class_id &&
      isExpectedEntry({
        entry_status: entry.entry_status ?? undefined,
        check_in_status: entry.check_in_status ?? undefined,
        deleted_at: entry.deleted_at ?? undefined,
      }) &&
      // Still waiting on an accept decision: the Results rows do not list it yet either.
      !isPendingEntryStatus(entry.entry_status)
  );
  if (live.some(entry => entry.handler_id === undefined)) return undefined;
  const groups = new Map<string, number>();
  for (const entry of live) {
    if (!entry.handler_id) continue;
    const key = `${entry.class_id}\u0000${entry.handler_id}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  let count = 0;
  const classIds = new Set<string>();
  for (const [key, size] of groups) {
    if (size < 2) continue;
    count += size;
    classIds.add(key.split('\u0000')[0] as string);
  }
  return { count, classIds: [...classIds] };
}
