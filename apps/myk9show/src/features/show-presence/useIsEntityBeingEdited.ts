/**
 * useIsEntityBeingEdited — Phase 3 consumer hook (docs/plan-show-presence.md §6).
 *
 * Returns whether ANOTHER present user currently has this entity's edit surface
 * open, plus their display name. Self is excluded (via the viewer id in context).
 *
 * Naturally false — no extra flag check needed — when edit-awareness is dark (the
 * producer broadcasts no `editing` slot) or when read outside a ShowPresence
 * provider (the roster is empty). Pure read of the shared roster; no side effects.
 */

import { useShowPresenceRoster } from './showPresenceContext';
import { whoIsEditing } from './presenceSelectors';

export interface EntityEditingState {
  /** True when someone OTHER than the local viewer is editing this entity. */
  isEditing: boolean;
  /** The other editor's display name, or null when nobody else is editing. */
  editorName: string | null;
}

export function useIsEntityBeingEdited(
  entityType: string,
  entityId: string
): EntityEditingState {
  const { present, viewerId } = useShowPresenceRoster();
  const editor = whoIsEditing(present, viewerId, entityType, entityId);
  return { isEditing: Boolean(editor), editorName: editor?.name ?? null };
}
