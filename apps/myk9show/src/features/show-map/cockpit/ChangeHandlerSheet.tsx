import { EntryEditDialog } from '@/components/entries/EntryEditDialog';
import { toEditDialogEntry } from '@/components/entries/toEditDialogEntry';
import type { EntriesRefresh } from '@/components/entries/management/checkInDesk/entriesRefresh';
import type { EntryManagementEntry } from '@/types/entry-management-types';

/**
 * Show Desk's "Change handler": the entry sheet in place, as Change class opens its dialog,
 * rather than a link to Entry Management (MYK9-1940). The write is online only, so the menu
 * greys the item out offline before this opens.
 */
export function ChangeHandlerSheet({
  entry,
  showName,
  onClose,
  onRefreshEntries,
}: {
  entry: EntryManagementEntry | null;
  showName?: string | undefined;
  onClose: () => void;
  onRefreshEntries?: EntriesRefresh | undefined;
}) {
  if (!entry) return null;
  return (
    <EntryEditDialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
      entry={toEditDialogEntry(entry, showName ?? 'this show')}
      onUpdate={() => {
        void onRefreshEntries?.();
      }}
      ignoreModificationDeadline
      asShowManager
      allowLeaveClass={false}
    />
  );
}
