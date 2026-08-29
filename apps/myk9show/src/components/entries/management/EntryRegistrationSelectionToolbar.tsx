import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EntryBulkActionMenu } from './EntryBulkActionMenu';
import { getEntryBulkActions } from './entryBulkActions';
import type { BulkActionResult, EntryManagementEntry } from '@/types/entry-management-types';
import type { EntryStatus } from '@/types/show-registration-types';
import { useRegisterActionBar } from '@/hooks/useRegisterActionBar';

interface EntryRegistrationSelectionToolbarProps {
  registrations: number;
  selectedEntries: EntryManagementEntry[];
  onBulkStatusChange: (
    entryIds: string[],
    status: EntryStatus,
    onFullSuccess?: () => void
  ) => BulkActionResult | Promise<BulkActionResult>;
  onClear: () => void;
  busy?: boolean;
}

export function EntryRegistrationSelectionToolbar({
  registrations,
  selectedEntries,
  onBulkStatusChange,
  onClear,
  busy = false,
}: EntryRegistrationSelectionToolbarProps) {
  // The toolbar floats 1.5rem above the safe-area bottom. Reserve that gap as
  // occupied too, otherwise a toast can overlap the toolbar by up to 12px.
  const actionBarRef = useRegisterActionBar<HTMLElement>({ bottomOffsetPx: 24 });

  if (registrations === 0) return null;

  const actions = getEntryBulkActions(selectedEntries, onBulkStatusChange, onClear);
  const primaryAction = actions.find(
    action => !action.disabled && action.variant !== 'destructive'
  );
  const overflowActions = actions.filter(action => action.id !== primaryAction?.id);

  return (
    <aside
      ref={actionBarRef}
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border bg-foreground px-3 py-2 text-background shadow-2xl"
      aria-label="Selected registration actions"
    >
      {/* The selection COUNT is what changes and should be announced; the
          toolbar around it holds buttons, and making the whole container a
          live region re-announces every one of them on each change. */}
      <span aria-hidden className="whitespace-nowrap px-1 text-sm font-semibold">
        {registrations} {registrations === 1 ? 'registration' : 'registrations'} ·{' '}
        {selectedEntries.length} {selectedEntries.length === 1 ? 'Entry' : 'Entries'}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {registrations} {registrations === 1 ? 'registration' : 'registrations'} selected,{' '}
        {selectedEntries.length} {selectedEntries.length === 1 ? 'entry' : 'entries'}
      </span>
      {primaryAction && (
        <Button type="button" variant="secondary" onClick={primaryAction.onSelect} disabled={busy}>
          {primaryAction.label}
        </Button>
      )}
      {overflowActions.length > 0 && (
        <EntryBulkActionMenu
          selectedEntries={selectedEntries}
          onBulkStatusChange={onBulkStatusChange}
          onClear={onClear}
          disabled={busy}
          actions={overflowActions}
        />
      )}
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
