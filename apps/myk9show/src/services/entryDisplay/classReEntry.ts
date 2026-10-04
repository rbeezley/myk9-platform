/**
 * The one rule for "can this dog be entered online in this class again?"
 * (MYK9-982). The wizard's class step and the cart reconciliation both read it,
 * so a class the step offers is never one the reconciliation silently removes.
 *
 * Owner decision (2026-10-03): a dog that withdrew (or was pulled) cannot
 * re-enter that class online. A secretary can still add the entry by hand; the
 * staff registration flow does not consult this rule.
 */
import { getEntryStatusKind, isActiveSubmittedEntryStatus } from './entryDisplaySelectors';

/** `entered`: a live entry. `withdrawn`: withdrawn or pulled. `unavailable`: any other ended row. */
export type ClassReEntryBlock = 'entered' | 'withdrawn' | 'unavailable';

export const WITHDRAWN_FROM_CLASS_REASON = 'Withdrawn from this class';

const BLOCK_PRECEDENCE: readonly ClassReEntryBlock[] = ['entered', 'withdrawn', 'unavailable'];

/** Classify one non-deleted entry row against re-entry into its class. */
export function getClassReEntryBlock(
  entryStatus: string | null | undefined,
  checkInStatus?: string | null | undefined
): ClassReEntryBlock {
  const kind = getEntryStatusKind(entryStatus ?? 'submitted');
  if (checkInStatus === 'pulled' || kind === 'withdrawn' || kind === 'scratched') {
    return 'withdrawn';
  }
  return isActiveSubmittedEntryStatus(entryStatus ?? 'submitted', checkInStatus)
    ? 'entered'
    : 'unavailable';
}

/** A live entry outranks a withdrawn one: the dog was re-added by hand. */
export function strongestClassReEntryBlock(
  blocks: Iterable<ClassReEntryBlock>
): ClassReEntryBlock | null {
  const seen = new Set(blocks);
  return BLOCK_PRECEDENCE.find(block => seen.has(block)) ?? null;
}

/** The exhibitor-facing sentence for a block that is not a live entry. */
export function classReEntryReason(block: ClassReEntryBlock): string {
  switch (block) {
    case 'withdrawn':
      return WITHDRAWN_FROM_CLASS_REASON;
    case 'entered':
      return 'Already entered';
    case 'unavailable':
      return 'This dog already has an entry in this class';
  }
}
