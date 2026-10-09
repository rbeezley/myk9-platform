/**
 * The Edit panel's one Delete control (CRUD standard Phase 3,
 * docs/archive/plan-crud-standard.md): a "Delete ‹object›" button at the far left of the
 * footer that opens the shared `DeleteObjectDialog`.
 *
 * INTENT: delete is settings, not a daily action. It sits apart from Cancel and
 * Save as an outline button, never a filled red one that competes with Save. A
 * panel passes `onDelete` only in edit mode and only for a viewer the server
 * would let delete; without it nothing renders.
 */
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DeleteObjectDialog,
  type DeleteObjectKind,
  type DeleteRecordsResult,
  type DeleteTarget,
} from '@/features/delete';

export interface EditPanelDeleteOption {
  kind: DeleteObjectKind;
  /** The one item this panel edits, as the confirm dialog names it. */
  targets: readonly DeleteTarget[];
  /** The noun on the button: "show" gives "Delete show". */
  objectLabel: string;
  /** After the delete. The panel has already closed itself; navigate away here. */
  onDeleted?: ((result: DeleteRecordsResult) => void) | undefined;
  /** After Undo brought the item back. */
  onRestored?: ((restored: DeleteTarget[]) => void) | undefined;
  /** Delete was pressed and the server call is starting. */
  onDeleteStart?: (() => void) | undefined;
  /** Nothing was deleted (refused or failed); the dialog stays open with the reason. */
  onDeleteFailed?: (() => void) | undefined;
  /** Invoked only when the blocked-delete recovery link is followed. */
  onBlockedAction?: (() => void) | undefined;
}

interface EditPanelDeleteButtonProps {
  option: EditPanelDeleteOption;
  disabled: boolean;
  onOpen: () => void;
  /** The footer's own placement: far left, and on its own line at phone width. */
  className?: string;
}

export function EditPanelDeleteButton({
  option,
  disabled,
  onOpen,
  className,
}: EditPanelDeleteButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      data-testid="edit-panel-delete"
      onClick={onOpen}
      disabled={disabled}
      className={cn(
        'gap-2 self-start border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive sm:self-auto',
        className
      )}
    >
      <Trash2 className="h-4 w-4" aria-hidden />
      Delete {option.objectLabel}
    </Button>
  );
}

interface EditPanelDeleteDialogProps {
  option: EditPanelDeleteOption;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (result: DeleteRecordsResult) => void;
}

/** Mounted only while open, so every open starts fresh (same rule as every other caller). */
export function EditPanelDeleteDialog({
  option,
  open,
  onOpenChange,
  onDeleted,
}: EditPanelDeleteDialogProps) {
  if (!open) return null;
  return (
    <DeleteObjectDialog
      open
      onOpenChange={onOpenChange}
      kind={option.kind}
      targets={option.targets}
      onDeleted={onDeleted}
      onRestored={option.onRestored}
      onDeleteStart={option.onDeleteStart}
      onDeleteFailed={option.onDeleteFailed}
      onBlockedAction={option.onBlockedAction}
    />
  );
}
