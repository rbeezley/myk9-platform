import React from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  CloudOff,
  CloudUpload,
  RefreshCw,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type {
  CompactOfflineIndicatorProps,
  ErrorStateProps,
  FilterPanelProps,
  FilterTriggerButtonProps,
  HamburgerMenuProps,
  PullToRefreshProps,
  RefreshIndicatorProps,
  SyncIndicatorProps,
} from '@myk9/ringside';
import { Button } from '@/components/ui/button';
import DelightfulError from '@/components/ui/DelightfulError';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useReplicationContainment } from '@/hooks/useReplicationContainment';
import { cn } from '@/lib/utils';
import { badgeClass, getSyncLabel, getSyncTier } from './atShowChrome.helpers';

export const HamburgerMenu: React.FC<HamburgerMenuProps> = ({ backNavigation, className }) => {
  if (!backNavigation) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      aria-label={backNavigation.label}
      title={backNavigation.label}
      className={cn('at-show-hamburger-back', className)}
      onClick={backNavigation.action}
    >
      <ArrowLeft size={20} />
    </Button>
  );
};

export const CompactOfflineIndicator: React.FC<CompactOfflineIndicatorProps> = ({ className }) => (
  <span
    className={cn(
      'at-show-offline-indicator inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
      badgeClass('neutral'),
      className
    )}
  >
    <CloudOff size={13} className="shrink-0" />
    Offline ready
  </span>
);

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
        <strong className="font-semibold">Score sync paused</strong> — the server asked this device
        to wait. Your scores are saved here and will sync automatically in about a minute.
      </span>
    </div>
  );
};

export const SyncIndicator: React.FC<SyncIndicatorProps> = ({
  status,
  pendingCount,
  errorMessage,
  onRetry,
  compact,
}) => {
  const Icon: LucideIcon =
    status === 'synced'
      ? CheckCircle
      : status === 'syncing'
        ? RefreshCw
        : status === 'pending'
          ? CloudUpload
          : status === 'offline'
            ? CloudOff
            : AlertCircle;
  const label = getSyncLabel(status);
  const hasPending = typeof pendingCount === 'number' && pendingCount > 0;

  return (
    <span
      className={cn(
        'at-show-sync-indicator inline-flex items-center gap-2 rounded-lg font-medium',
        compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        badgeClass(getSyncTier(status))
      )}
      data-status={status}
      {...(status === 'error' && errorMessage ? { title: errorMessage } : {})}
    >
      <Icon size={16} className={cn('shrink-0', status === 'syncing' && 'animate-spin')} />
      <span>{label}</span>
      {hasPending && (
        <span className="at-show-sync-pending rounded-full bg-foreground/10 px-1.5 py-0.5 text-xs font-semibold">
          {pendingCount}
        </span>
      )}
      {status === 'error' && onRetry && (
        <button
          type="button"
          // Ringside recovery tap: meet the 44px touch floor (INTENT.md) even
          // though it lives inside an inline status pill — the pill grows to fit.
          className="ml-0.5 inline-flex min-h-11 items-center justify-center rounded-md bg-foreground/10 px-3 text-sm font-medium transition-colors hover:bg-foreground/20"
          onClick={onRetry}
        >
          Retry
        </button>
      )}
    </span>
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

export const FilterTriggerButton: React.FC<FilterTriggerButtonProps> = ({
  onClick,
  hasActiveFilters,
  className,
}) => (
  <Button
    type="button"
    variant="ghost"
    size="icon-lg"
    aria-label="Search & sort"
    title="Search & sort"
    className={cn('at-show-filter-trigger relative', className)}
    onClick={onClick}
  >
    <SlidersHorizontal size={20} />
    {hasActiveFilters && (
      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
    )}
  </Button>
);

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
