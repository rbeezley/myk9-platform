import { useState, type ReactNode } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge, StatusIcon } from '@/components/status';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { resolveEntryStatusActions, type EntryStatusActionDefinition } from './entryActions';

interface EntryStatusPopoverProps {
  entry: EntryManagementEntry;
  entryClassName: string;
  onStatusChange: (
    entryId: string,
    status: EntryStatus
  ) => void | boolean | Promise<boolean | void>;
  additionalContent?: ReactNode;
}

export function EntryStatusPopover({
  entry,
  entryClassName,
  onStatusChange,
  additionalContent,
}: EntryStatusPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [failedAction, setFailedAction] = useState<EntryStatusActionDefinition | null>(null);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const actions = resolveEntryStatusActions(entry, { onStatusChange });

  const runAction = async (action: EntryStatusActionDefinition) => {
    setOpen(false);
    setPendingActionId(action.id);
    setFailedAction(null);
    setQueuedOffline(false);
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;

    try {
      const result = await onStatusChange(entry.id, action.statusTarget);
      if (result === false) {
        setFailedAction(action);
        return;
      }
      setQueuedOffline(offline);
    } catch {
      setFailedAction(action);
    } finally {
      setPendingActionId(null);
    }
  };

  const isPending = pendingActionId !== null;

  return (
    <div className="flex flex-col gap-0.5">
      <Popover open={open} onOpenChange={nextOpen => !isPending && setOpen(nextOpen)}>
        <PopoverTrigger asChild nativeButton>
          <button
            type="button"
            disabled={isPending || actions.length === 0}
            aria-busy={isPending}
            className={cn(
              'inline-flex min-h-11 min-w-11 items-center justify-start gap-1 rounded-md px-1 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70'
            )}
            aria-label={`Change entry status for ${entry.dogName} in ${entryClassName}`}
          >
            <StatusBadge family="entry" status={entry.entryStatus} variant="outline" />
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2" role="menu">
          <p className="px-2 pb-1 text-sm font-semibold">Change status</p>
          {actions.map(action => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              onClick={() => void runAction(action)}
            >
              <StatusIcon family="entry" status={action.statusTarget} size="sm" decorative />
              <span>{typeof action.label === 'function' ? action.label(entry) : action.label}</span>
            </button>
          ))}
          {additionalContent && (
            <div
              className="mt-2 border-t pt-2"
              onClick={event => {
                if ((event.target as HTMLElement).closest('[data-status-popover-action]')) {
                  setOpen(false);
                }
              }}
            >
              {additionalContent}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {queuedOffline && (
        <span role="status" className="text-xs text-muted-foreground">
          Status change queued — will sync when online.
        </span>
      )}
      {failedAction && (
        <div role="alert" className="flex items-center gap-2 text-xs text-destructive">
          <span>Couldn&apos;t update status.</span>
          <button
            type="button"
            className="min-h-11 rounded px-2 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => void runAction(failedAction)}
            aria-label="Retry status update"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
