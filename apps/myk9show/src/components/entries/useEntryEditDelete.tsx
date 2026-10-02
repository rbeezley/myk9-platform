/**
 * The entry edit sheet's footer Delete (CRUD standard Phase 3): the "Delete entry"
 * button, the shared confirm dialog, and the open state the sheet needs so Save and
 * every dismissal hold still while that dialog is open.
 *
 * `soft_delete_entry` requires `can_manage_show`, the rule behind `asShowManager`, so
 * only a show manager gets the controls; an exhibitor withdraws instead.
 */
import { useState } from 'react';
import { entryDeleteDetail } from '@/features/delete';
import {
  EditPanelDeleteButton,
  EditPanelDeleteDialog,
} from '@/components/panels/edit/EditPanelDelete';

interface EntryForDelete {
  id: string;
  showId: string;
  dogName: string;
  handler?: string | undefined;
  classes: { name: string }[];
}

interface UseEntryEditDeleteArgs {
  entry: EntryForDelete;
  enabled: boolean;
  /** Close the sheet. Called once the entry is deleted, with no discard prompt. */
  closeSheet: () => void;
  onDeleted?: ((entryIds: string[]) => void) | undefined;
  onRestored?: (() => void) | undefined;
}

export function useEntryEditDelete({
  entry,
  enabled,
  closeSheet,
  onDeleted,
  onRestored,
}: UseEntryEditDeleteArgs) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const option = {
    kind: 'entry' as const,
    objectLabel: 'entry',
    targets: [
      {
        id: entry.id,
        name: entry.dogName,
        detail: entryDeleteDetail({
          callName: entry.dogName,
          handlerName: entry.handler,
          className: entry.classes[0]?.name,
        }),
        context: { showId: entry.showId },
      },
    ],
    onRestored,
  };

  /** DOM-first in the footer: the bottom line on a phone (it stacks in reverse), far left from sm up. */
  const deleteButton = (saving: boolean) =>
    enabled ? (
      <EditPanelDeleteButton
        option={option}
        disabled={saving || deleteOpen}
        onOpen={() => setDeleteOpen(true)}
        className="sm:mr-auto"
      />
    ) : null;

  /** Rendered inside the sheet so Base UI stacks it as a nested dialog, not under the inert layer. */
  const deleteDialog = enabled ? (
    <EditPanelDeleteDialog
      option={option}
      open={deleteOpen}
      onOpenChange={setDeleteOpen}
      onDeleted={({ deleted, alreadyGone }) => {
        setDeleteOpen(false);
        // The entry is gone, so its unsaved edits are moot.
        closeSheet();
        onDeleted?.([...deleted, ...alreadyGone].map(target => target.id));
      }}
    />
  ) : null;

  return { deleteOpen, deleteButton, deleteDialog };
}
