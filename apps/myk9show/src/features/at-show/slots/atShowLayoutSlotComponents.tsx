import React, { useContext } from 'react';
import { CloudOff, CloudUpload } from 'lucide-react';
import { ReplicationSyncStatusContext } from '@/context/ReplicationSyncContext';
import type {
  CompactOfflineIndicatorProps,
  ErrorStateProps,
  FilterPanelProps,
  PullToRefreshProps,
  RefreshIndicatorProps,
} from '@myk9/ringside';
import DelightfulError from '@/components/ui/DelightfulError';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useReplicationContainment } from '@/hooks/useReplicationContainment';
import { cn } from '@/lib/utils';
import { useSyncNote } from '@/components/shows/ShowDetails/ShowSyncStatus';
import { useOnlineStatus } from '@/lib/networkUtils';
import { badgeClass } from './atShowChrome.helpers';
import { OfflineSyncNoteView } from './atShowSyncChrome';

export { FilterTriggerButton, SyncIndicator } from './atShowSyncChrome';

/** The tables the at-show surface must hold locally before it can promise offline use. */
const AT_SHOW_OFFLINE_TABLES = ['shows', 'trials', 'classes', 'entries'] as const;

/**
 * Reads the sync note only once offline, so an online header never depends on the sync provider.
 * Phones get the icon-only popover button (44px, no wrap in the pinned bar); `sm` and up get the
 * amber note, which wraps rather than truncates (MYK9-1899).
 */
const OfflineSyncNote: React.FC<{ className?: string | undefined }> = ({ className }) => (
  <OfflineSyncNoteView label={useSyncNote().label} className={className} />
);

/**
 * The persistent "this app works offline" affordance in the at-show header.
 *
 * The CAPABILITY framing is deliberate and pre-existing: #739 ("Clarify
 * persistent offline capability copy as Offline ready") chose it specifically so
 * the chip does not read as a statement about current connectivity, and
 * `atShowLayoutSlotComponents.test.ts` pins that it never renders a bare
 * "Offline". That decision is preserved here — this is not a network indicator,
 * and the sync/queue state has its own dedicated surfaces.
 *
 * What was NOT true is the timing. The chip rendered the constant with no inputs
 * at all, so it promised offline readiness on a cold first load, before the
 * tables this surface depends on had ever synced — a judge deciding whether to
 * walk into a dead-zone ring was reading a hard-coded string. The capability is
 * only real once that data is local, so until then we say we are still preparing
 * rather than claiming readiness. Connectivity is still never mentioned.
 */
export const CompactOfflineIndicator: React.FC<CompactOfflineIndicatorProps> = ({ className }) => {
  // Read the context directly rather than through `useReplicationSync`, which
  // throws when no provider is mounted. App.tsx wraps the whole tree so that
  // never happens in production -- but a header chip must not be able to take
  // down a judge's ring list, and "no provider" is one more way of not knowing
  // whether the data is local. Unknown is handled like every other unknown
  // here: decline to promise.

  // Deliberately NOT `areReplicationTablesPendingFirstSync`. That helper starts
  // with `if (status.isSyncing) return true`, which is right for a page-level
  // empty-state gate and wrong for a persistent capability chip: the provider
  // re-syncs every 60s, so the chip would retract its promise once a minute for
  // the whole show. An aborted table sync also lands back on 'idle' -- a
  // "pending" status -- which would strand the chip on "Preparing..." while the
  // data it describes is already in IndexedDB.
  //
  // The honest question is whether the data is LOCAL, not whether a sync is in
  // flight. `lastSyncAt` answers that durably: once a full sync has completed,
  // a later refresh (or a failed one) does not remove what is already stored.
  const status = useContext(ReplicationSyncStatusContext);
  const ready =
    !!status?.lastSyncAt &&
    AT_SHOW_OFFLINE_TABLES.every(table => status.tablesStatus[table] !== 'error');

  const isOnline = useOnlineStatus();

  // MYK9-1744: offline is the one persistent signal, and it is amber, in the bar the indicator
  // already occupies (full sentence in `title`), no new row.
  if (!isOnline) {
    return <OfflineSyncNote className={className} />;
  }

  return (
    <span
      className={cn(
        'at-show-offline-indicator inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        // Phones have no room beside the class title: when ready the chip is
        // hidden, and while preparing it shrinks to the icon (text stays for
        // screen readers).
        ready ? 'max-sm:hidden' : 'max-sm:px-1.5',
        badgeClass('neutral'),
        className
      )}
    >
      <CloudOff size={13} className="shrink-0" />
      <span className={cn(!ready && 'max-sm:sr-only')}>
        {ready ? 'Offline ready' : 'Preparing offline copy…'}
      </span>
    </span>
  );
};

/**
 * Shown while the server has asked this device to pause score uploads
 * (MYK9-115 admission control).
 *
 * INTENT: calm, not alarming. The scores ARE saved and the outbox resumes by
 * itself — the only real risk here is a judge who sees the queue stop draining,
 * assumes the work is lost, and starts re-entering it. So the copy leads with
 * safety and names the cause as the server, not the device or the network.
 *
 * There is deliberately NO retry control. The server is shedding load; a
 * "retry now" button would let a worried judge hammer the breaker protecting
 * the show. Contrast SyncIndicator's error state, where retrying IS the fix.
 */
export const ContainmentBanner: React.FC<{ className?: string }> = ({ className }) => {
  const { active } = useReplicationContainment();
  if (!active) return null;

  return (
    <div
      role="status"
      data-testid="at-show-containment-banner"
      className={cn(
        'at-show-containment-banner flex items-start gap-2 rounded-lg px-3 py-2 text-sm font-medium',
        badgeClass('warning'),
        className
      )}
    >
      <CloudUpload size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">Sending scores is paused.</strong> myK9Show asked this
        device to wait. Your scores are saved on this device and will be sent in about a minute.
      </span>
    </div>
  );
};

export const RefreshIndicator: React.FC<RefreshIndicatorProps> = ({
  isRefreshing,
  position,
  message,
  className,
}) => {
  if (!isRefreshing) return null;
  return (
    <div
      className={cn(
        'at-show-refresh-indicator text-center text-xs text-muted-foreground',
        className
      )}
      data-position={position ?? 'top'}
    >
      {message ?? 'Refreshing…'}
    </div>
  );
};

export const FilterPanel: React.FC<FilterPanelProps> = ({
  isOpen,
  onClose,
  searchTerm,
  onSearchChange,
  searchPlaceholder,
  sortOptions,
  sortOrder,
  onSortChange,
  resultsLabel,
  title,
  children,
}) => (
  <Sheet
    open={isOpen}
    onOpenChange={open => {
      if (!open) onClose();
    }}
  >
    <SheetContent side="right" className="at-show-filter-panel">
      <SheetHeader>
        <SheetTitle>{title ?? 'Filter & Sort'}</SheetTitle>
      </SheetHeader>

      <div className="mt-4 space-y-4">
        <Input
          type="search"
          value={searchTerm}
          placeholder={searchPlaceholder ?? 'Search…'}
          onChange={event => onSearchChange(event.target.value)}
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Sort by</legend>
          {sortOptions.map(option => (
            // Full-width row is the tap target: a native ~16px radio is well
            // under the 44px ringside floor, so the label wraps it to min-h-11
            // and a tap anywhere on the row toggles the radio.
            <label
              key={option.value}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 text-sm transition-colors hover:bg-muted"
            >
              <input
                type="radio"
                name="at-show-sort-order"
                value={option.value}
                checked={sortOrder === option.value}
                onChange={() => onSortChange(option.value)}
                className="h-5 w-5 shrink-0 accent-primary"
              />
              {option.icon}
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>

        {resultsLabel && (
          <p className="at-show-filter-results text-xs text-muted-foreground">{resultsLabel}</p>
        )}

        {children}
      </div>
    </SheetContent>
  </Sheet>
);

// The containment banner rides here rather than in a slot of its own.
// `EntryListLayoutSlots` (@myk9/ringside) has no banner slot, and widening that
// shared interface — plus every consumer that supplies it — is a larger change
// than one message warrants. This is the body wrapper: always mounted, full
// width, directly above the entry list, which is where a judge is looking.
// If a second full-width notice ever needs this spot, add the slot properly.
export const PullToRefresh: React.FC<PullToRefreshProps> = ({ children, className }) => (
  <div className={cn('at-show-pull-to-refresh', className)}>
    <ContainmentBanner className="mb-2" />
    {children}
  </div>
);

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry, className }) => (
  <div className={cn('at-show-error-state', className)}>
    <DelightfulError
      variant="component"
      {...(message ? { message } : {})}
      {...(onRetry ? { reset: onRetry } : {})}
    />
  </div>
);
