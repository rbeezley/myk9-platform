/**
 * EditingBadge — Phase 3 of docs/plan-show-presence.md.
 *
 * A calm, advisory "{name} is editing this" heads-up, shown when ANOTHER present
 * user has the same entity's edit surface open. It exists to reduce wasted /
 * colliding edits — a soft awareness, not a control.
 *
 * INTENT: advisory ONLY (docs/INTENT.md §3 "Calm Over Clever"; plan §6 Phase 3).
 * It MUST NOT disable Save, block input, or gate the form. Do not "upgrade" it
 * into a hard edit-lock, a disabled-Save state, or a blocking modal — that is
 * Phase 4's conflict-resolution contract, a different UX. Keep it calm: steady
 * (no motion), muted, amber (a gentle heads-up — never red/alarm). role="status"
 * gives an implicit aria-live="polite" so a screen reader announces it once,
 * gently. Renders nothing when nobody else is editing or the feature is dark.
 */

import { cn } from '@/lib/utils';
import { useIsEntityBeingEdited } from './useIsEntityBeingEdited';
import { showEditAwarenessEnabled } from './editAwarenessFlag';

export interface EditingBadgeProps {
  entityType: string;
  entityId: string;
  className?: string;
}

export function EditingBadge({ entityType, entityId, className }: EditingBadgeProps) {
  // Hook called unconditionally (rules-of-hooks); the flag/empty branches below
  // decide whether anything renders.
  const { isEditing, editorName } = useIsEntityBeingEdited(entityType, entityId);

  // Dark by default until live-validated (own kill switch, plan §6/§12). When dark
  // the producer broadcasts nothing, so isEditing is already false — this is the
  // belt-and-suspenders consumer gate.
  if (!showEditAwarenessEnabled() || !isEditing) return null;

  return (
    <span
      role="status"
      title={`${editorName} currently has this open for editing`}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs text-muted-foreground',
        className
      )}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
      {editorName} is editing this
    </span>
  );
}
