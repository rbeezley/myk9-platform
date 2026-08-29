/**
 * Resolves whether the wizard's edit-mode target show is actually KNOWN.
 *
 * The wizard reuses the create flow for `add-trials` / `add-classes`, and the
 * save path calls `updateShow(editMode.showId, ...)` with a FULL show record.
 * That makes "have we really loaded this show?" a write-safety question, not a
 * rendering one: the wizard skips `resetWizard()` in edit mode, and the wizard
 * store persists `show` and `trials`, so an unresolved target leaves the
 * PREVIOUS session's draft mounted under an "Add Trials" title — and saving
 * writes that draft over the real show.
 *
 * The third state is not optional here. `ReplicatedTableQuery.getAll()` catches
 * every error including its own timeout and returns `[]` (MYK9-252), so
 * `withReplicationFallback` never sees a throw and the query RESOLVES with an
 * empty list. A settled query that does not contain the show therefore proves
 * nothing — it is indistinguishable from a failed read. We must not render that
 * as "this show does not exist", and we must never let it reach a write.
 */
import type { Show } from '@/types/show-types';
import type { EditMode } from './show-creation-wizard-types';

export type EditModeResolution =
  /** Not in edit mode — a fresh create, nothing to resolve. */
  | { state: 'not-applicable' }
  /** The show is loaded; safe to build a draft from it and to save. */
  | { state: 'resolved'; show: Show }
  /** Still reading. Render a loader, never step content. */
  | { state: 'loading' }
  /**
   * The read settled without the show. Because a failed replicated read is
   * reported as an empty list, we cannot tell "missing" from "unread" — so this
   * state claims neither. It blocks the wizard and offers a retry.
   */
  | { state: 'unavailable' };

interface ResolveEditModeArgs {
  editMode: EditMode | undefined;
  /** Shows available to the Zustand writer used by the wizard's save path. */
  writableShows: readonly Show[];
  /** The writer's backing store is still being loaded. */
  showsLoading: boolean;
}

export function resolveEditMode({
  editMode,
  writableShows,
  showsLoading,
}: ResolveEditModeArgs): EditModeResolution {
  if (!editMode) return { state: 'not-applicable' };

  const show = writableShows.find(candidate => candidate.id === editMode.showId);
  if (show) return { state: 'resolved', show };

  if (showsLoading) return { state: 'loading' };

  return { state: 'unavailable' };
}

/**
 * The set of edit modes the app actually links to. `mode` arrives from a query
 * string and was previously read with an unchecked `as` cast, so ANY string
 * paired with a `showId` produced an edit-mode object — including the
 * unreachable `edit-show`, whose labels fell through to "Create Show
 * (Unpublished)" and whose save wrote `status` straight from the button.
 */
const SUPPORTED_EDIT_MODES = ['add-trials', 'add-classes'] as const;

export function parseEditMode(showId: string | null, mode: string | null): EditMode | undefined {
  if (!showId || !mode) return undefined;
  const match = SUPPORTED_EDIT_MODES.find(supported => supported === mode);
  return match ? { showId, mode: match } : undefined;
}
