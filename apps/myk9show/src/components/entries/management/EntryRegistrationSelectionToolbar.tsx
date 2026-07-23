import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EntryBulkActionMenu } from './EntryBulkActionMenu';
import type { BulkActionResult, EntryManagementEntry } from '@/types/entry-management-types';
import type { EntryStatus } from '@/types/show-registration-types';

interface EntryRegistrationSelectionToolbarProps {
  registrations: number;
  selectedEntries: EntryManagementEntry[];
  onBulkStatusChange: (
    entryIds: string[],
    status: EntryStatus,
    onFullSuccess?: () => void
  ) => BulkActionResult | Promise<BulkActionResult>;
  onBulkCheckIn: (
    entryIds: string[],
    onFullSuccess?: () => void
  ) => BulkActionResult | Promise<BulkActionResult>;
  onClear: () => void;
  busy?: boolean;
}

export function EntryRegistrationSelectionToolbar({
  registrations,
  selectedEntries,
  onBulkStatusChange,
  onBulkCheckIn,
  onClear,
  busy = false,
}: EntryRegistrationSelectionToolbarProps) {
  if (registrations === 0) return null;

  return (
    <aside
      className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border bg-foreground px-3 py-2 text-background shadow-2xl"
      aria-label="Selected registration actions"
    >
      <span className="whitespace-nowrap px-1 text-sm font-semibold">
        {registrations} {registrations === 1 ? 'registration' : 'registrations'} ·{' '}
        {selectedEntries.length} {selectedEntries.length === 1 ? 'Entry' : 'Entries'}
      </span>
      <EntryBulkActionMenu
        selectedEntries={selectedEntries}
        onBulkStatusChange={onBulkStatusChange}
        onBulkCheckIn={onBulkCheckIn}
        onClear={onClear}
        disabled={busy}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="text-background hover:bg-background/15 hover:text-background"
        onClick={onClear}
        disabled={busy}
        aria-label="Clear registration selection"
      >
        <X className="h-4 w-4" aria-hidden />
      </Button>
    </aside>
  );
}
