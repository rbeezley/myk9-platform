/**
 * Every word the delete dialog and its toasts say, in one place (CRUD standard
 * Phase 2). The rules, from docs/archive/plan-crud-standard.md and docs/INTENT.md:
 *
 * - Delete is a SOFT delete everywhere, so nothing here says "permanently" or
 *   "cannot be undone". The deleter has a 10-minute Undo; after that only a site
 *   admin restores, and the dialog says exactly that.
 * - The title names the type AND the item. The buttons say what they do:
 *   "Delete ‹object›" and "Keep it", never OK / Confirm / Yes.
 * - A blocked delete names the paid or scored work and points at the path that
 *   is allowed: Cancel show for a show, Withdraw or Pull for entries. Pull and
 *   Withdraw are different things and are always named as two.
 */
import type {
  DeleteObjectKind,
  DeletePreview,
  DeletePreviewUnavailableReason,
  DeleteTarget,
} from './deleteTypes';

const NOUNS: Record<DeleteObjectKind, readonly [string, string]> = {
  club: ['club', 'clubs'],
  show: ['show', 'shows'],
  trial: ['trial', 'trials'],
  class: ['class', 'classes'],
  entry: ['entry', 'entries'],
  dog: ['dog', 'dogs'],
  person: ['person', 'people'],
};

export function objectNoun(kind: DeleteObjectKind, count = 1): string {
  return NOUNS[kind][count === 1 ? 0 : 1];
}

/** "1 entry", "3 entries". */
export function countOf(kind: DeleteObjectKind, count: number): string {
  return `${count} ${objectNoun(kind, count)}`;
}

/** "A", "A and B", "A, B and C". */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

export const BULK_NAMES_SHOWN = 5;

/** Up to five names, then "and N more". */
export function bulkNameList(targets: readonly DeleteTarget[]): string {
  const shown = targets.slice(0, BULK_NAMES_SHOWN).map(target => target.name);
  const rest = targets.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : joinWords(shown);
}

/** "Delete the show Heartland Scent Work Classic?" / "Delete 3 shows?" */
export function deleteTitle(kind: DeleteObjectKind, targets: readonly DeleteTarget[]): string {
  if (targets.length !== 1) return `Delete ${countOf(kind, targets.length)}?`;
  const name = targets[0]?.name ?? '';
  if (kind === 'entry') return `Delete the entry for ${name}?`;
  return `Delete the ${objectNoun(kind)} ${name}?`;
}

/** "Delete show" / "Delete 3 shows". */
export function deleteButtonLabel(kind: DeleteObjectKind, count: number): string {
  return count === 1 ? `Delete ${objectNoun(kind)}` : `Delete ${countOf(kind, count)}`;
}

export const KEEP_LABEL = 'Keep it';
export const DELETING_LABEL = 'Deleting…';

/** What goes with the item, as counts in words. Null when nothing cascades. */
export function cascadeSentence(
  kind: DeleteObjectKind,
  preview: DeletePreview,
  count: number
): string | null {
  const its = count === 1 ? 'its' : 'their';
  const parts: string[] = [];
  if (kind === 'show' && preview.trials > 0) parts.push(countOf('trial', preview.trials));
  if ((kind === 'show' || kind === 'trial') && preview.classes > 0) {
    parts.push(countOf('class', preview.classes));
  }
  if (kind !== 'entry' && kind !== 'club' && kind !== 'person' && preview.entries > 0) {
    parts.push(countOf('entry', preview.entries));
  }
  if (parts.length > 0) return `This also removes ${its} ${joinWords(parts)}.`;
  if (kind === 'person') return 'Their myK9 roles are switched off too.';
  if (kind === 'show' || kind === 'trial' || kind === 'class' || kind === 'dog') {
    return 'Nothing else goes with it.';
  }
  return null;
}

export function undoSentence(count: number): string {
  return `You can undo this for 10 minutes. After that, ask a myK9 administrator to restore ${
    count === 1 ? 'it' : 'them'
  }.`;
}

/** "3 entries are paid", "1 entry is scored", "3 entries are paid and 2 are scored". */
export function paidScoredPhrase(paid: number, scored: number): string {
  const be = (n: number) => (n === 1 ? 'is' : 'are');
  if (paid > 0 && scored > 0)
    return `${countOf('entry', paid)} ${be(paid)} paid and ${scored} ${be(scored)} scored`;
  if (paid > 0) return `${countOf('entry', paid)} ${be(paid)} paid`;
  if (scored > 0) return `${countOf('entry', scored)} ${be(scored)} scored`;
  return 'Some entries are paid or scored';
}

function entryState(preview: DeletePreview): string {
  if (preview.paid > 0 && preview.scored > 0) return 'This entry is paid and scored';
  if (preview.scored > 0) return 'This entry is scored';
  return 'This entry is paid';
}

/** Why a single item cannot be deleted, naming the paid or scored work. */
export function blockedReason(kind: DeleteObjectKind, preview: DeletePreview): string {
  switch (kind) {
    case 'show':
      return `${paidScoredPhrase(preview.paid, preview.scored)}. Cancel the show instead of deleting it.`;
    case 'trial':
    case 'class':
      return `${paidScoredPhrase(preview.paid, preview.scored)}. Withdraw or Pull those entries first.`;
    case 'entry':
      return `${entryState(preview)}. Use Withdraw or Pull instead of deleting it.`;
    case 'dog':
      return `${paidScoredPhrase(preview.paid, preview.scored)}. Withdraw or Pull those entries before deleting the dog.`;
    case 'club':
      return `This club still has ${countOf('show', preview.shows)}. Delete or move its shows first.`;
    case 'person':
      return `This person still owns ${countOf('dog', preview.dogs)}. Delete those dogs or give them a new owner first.`;
  }
}

/** Why a bulk delete cannot run: which of the selected items are blocked. */
export function bulkBlockedReason(
  kind: DeleteObjectKind,
  blocked: readonly DeleteTarget[]
): string {
  const names = bulkNameList(blocked);
  const plural = blocked.length !== 1;
  const has = plural ? 'have' : 'has';
  const leaveOut = `Leave ${plural ? 'them' : 'it'} out of the selection to delete the rest.`;
  switch (kind) {
    case 'club':
      return `${names} still ${has} shows. ${leaveOut}`;
    case 'person':
      return `${names} still ${plural ? 'own' : 'owns'} dogs. ${leaveOut}`;
    case 'show':
      return `${names} ${has} paid or scored entries. Cancel ${plural ? 'those shows' : 'that show'} instead. ${leaveOut}`;
    case 'entry':
      return `${names} ${plural ? 'are' : 'is'} paid or scored. Use Withdraw or Pull instead. ${leaveOut}`;
    default:
      return `${names} ${has} paid or scored entries. Withdraw or Pull those entries first. ${leaveOut}`;
  }
}

/** Why Delete is off when the counts are not known. */
export function unknownReason(
  kind: DeleteObjectKind,
  reason: DeletePreviewUnavailableReason | 'pending',
  count: number
): string {
  const thing = count === 1 ? `this ${objectNoun(kind)}` : `these ${objectNoun(kind, count)}`;
  switch (reason) {
    case 'pending':
      return `Checking what goes with ${thing}…`;
    case 'offline':
      return "You're offline. Deleting needs a connection, so Delete is off until you're back online.";
    case 'forbidden':
      return `You don't have permission to delete ${thing}.`;
    case 'failed':
      return `We couldn't check what goes with ${thing}, so Delete is off. Try again.`;
  }
}

/**
 * Delete is off while this device has changes that have not uploaded: a delete
 * would purge work the server can neither count nor bring back.
 */
export function unsavedWorkNotice(total: number, failed: number): string {
  const lead =
    total === 1
      ? "Finish saving first: 1 change on this device hasn't uploaded yet."
      : `Finish saving first: ${total} changes on this device haven't uploaded yet.`;
  if (failed === 0) return lead;
  const which = failed === total ? (failed === 1 ? 'It' : 'They') : `${failed} of them`;
  return `${lead} ${which} failed to upload: use Retry or Discard on the sync error notice, then check again.`;
}

export const UNSAVED_WORK_CHECK_FAILED =
  "We couldn't check whether this device has changes still saving, so Delete is off. Check again.";

/** The link a blocked delete offers. Pull and Withdraw are named as two paths. */
export function blockedActionLabel(kind: DeleteObjectKind): string | null {
  if (kind === 'show') return 'Cancel show';
  if (kind === 'trial' || kind === 'class' || kind === 'entry') return 'Withdraw / Pull entries';
  return null;
}

// ─── Toasts ──────────────────────────────────────────────────────────────────

/** "Show deleted" / "3 shows deleted". */
export function deletedToast(kind: DeleteObjectKind, targets: readonly DeleteTarget[]): string {
  if (targets.length === 1) {
    const noun = objectNoun(kind);
    return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} deleted: ${targets[0]?.name ?? ''}`;
  }
  return `${countOf(kind, targets.length)} deleted`;
}

/** The preview found every item already deleted elsewhere: nothing left to delete. */
export function alreadyDeletedToast(
  kind: DeleteObjectKind,
  targets: readonly DeleteTarget[]
): string {
  if (targets.length === 1) {
    const noun = objectNoun(kind);
    return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} was already deleted: ${targets[0]?.name ?? ''}`;
  }
  return `${countOf(kind, targets.length)} were already deleted`;
}

/** In the dialog: items another device already deleted. They are not counted or deleted again. */
export function alreadyDeletedNotice(targets: readonly DeleteTarget[]): string {
  const names = targets.map(target => target.name).join(', ');
  return `Already deleted: ${names}. ${
    targets.length === 1 ? 'It is' : 'They are'
  } not counted here, and ${targets.length === 1 ? 'it leaves' : 'they leave'} this device when you confirm.`;
}

export function restoredToast(kind: DeleteObjectKind, count: number): string {
  if (count === 1) {
    const noun = objectNoun(kind);
    return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} restored`;
  }
  return `${countOf(kind, count)} restored`;
}

export const UNDO_LABEL = 'Undo';

export function undoExpiredMessage(count: number): string {
  return `The 10 minutes to undo this are over. Ask a myK9 administrator to restore ${
    count === 1 ? 'it' : 'them'
  }.`;
}

/** Partial bulk failure: some went, some did not. */
export function partialFailureMessage(
  kind: DeleteObjectKind,
  failed: number,
  total: number
): string {
  return `${failed} of ${countOf(kind, total)} could not be deleted. The others were deleted.`;
}
