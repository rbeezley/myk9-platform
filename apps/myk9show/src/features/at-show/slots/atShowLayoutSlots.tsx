/**
 * atShowLayoutSlots — myK9Show host shims for ringside's
 * `EntryListLayoutSlots` contract (Phase 1a spike).
 *
 * Each component is a thin host-side implementation of one ringside
 * layout primitive, typed exactly against the matching `*Props`
 * interface re-exported from `@myk9/ringside`. The assembled
 * `atShowLayoutSlots` bag is what the host shim passes to the ringside
 * EntryList page's `layout` prop.
 *
 * These are deliberately minimal-but-functional: they render real JSX
 * and wire the contract's callbacks/children, but visual polish lands
 * in a later /at-show UI sprint. They wrap existing myK9Show primitives
 * where trivially helpful.
 *
 * exactOptionalPropertyTypes is ON in this app — never pass an explicit
 * `undefined` to an optional prop; omit or guard instead.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Popover, PopoverContent } from '@/components/ui/popover';
import DelightfulError from '@/components/ui/DelightfulError';
import type {
  EntryListLayoutSlots,
  HamburgerMenuProps,
  CompactOfflineIndicatorProps,
  SyncIndicatorProps,
  RefreshIndicatorProps,
  FilterTriggerButtonProps,
  FilterPanelProps,
  DogCardProps,
  PullToRefreshProps,
  ErrorStateProps,
  ClassDetailsPopoverProps,
  DogCardStatusBorder,
} from '@myk9/ringside';

// ---------------------------------------------------------------------------
// Header chrome
// ---------------------------------------------------------------------------

/**
 * Top-left nav drawer. Spike renders only the optional "← Back to X"
 * affordance as a button; the full drawer lands in the UI sprint.
 */
const HamburgerMenu: React.FC<HamburgerMenuProps> = ({ backNavigation, className }) => {
  if (!backNavigation) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('at-show-hamburger-back', className)}
      onClick={backNavigation.action}
    >
      ← {backNavigation.label}
    </Button>
  );
};

/** Compact "offline" pill. Spike renders a small static status span. */
const CompactOfflineIndicator: React.FC<CompactOfflineIndicatorProps> = ({ className }) => (
  <span className={cn('at-show-offline-indicator text-xs text-muted-foreground', className)}>
    Offline
  </span>
);

/** Sync status pill with optional retry. */
const SyncIndicator: React.FC<SyncIndicatorProps> = ({
  status,
  pendingCount,
  errorMessage,
  onRetry,
  compact,
}) => {
  const label =
    status === 'error'
      ? errorMessage || 'Sync error'
      : status === 'syncing'
        ? 'Syncing…'
        : status === 'offline'
          ? 'Offline'
          : 'Synced';
  return (
    <span
      className={cn(
        'at-show-sync-indicator inline-flex items-center gap-1',
        compact ? 'text-xs' : 'text-sm',
      )}
      data-status={status}
    >
      <span>{label}</span>
      {typeof pendingCount === 'number' && pendingCount > 0 && (
        <span className="at-show-sync-pending">({pendingCount})</span>
      )}
      {status === 'error' && onRetry && (
        <button type="button" className="underline" onClick={onRetry}>
          Retry
        </button>
      )}
    </span>
  );
};

/** Refresh spinner shown above/below the list during pull-refresh. */
const RefreshIndicator: React.FC<RefreshIndicatorProps> = ({
  isRefreshing,
  position,
  message,
  className,
}) => {
  if (!isRefreshing) return null;
  return (
    <div
      className={cn('at-show-refresh-indicator text-center text-xs text-muted-foreground', className)}
      data-position={position ?? 'top'}
    >
      {message ?? 'Refreshing…'}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Filter + search
// ---------------------------------------------------------------------------

/** Button that opens the FilterPanel; shows an active-filter count badge. */
const FilterTriggerButton: React.FC<FilterTriggerButtonProps> = ({
  onClick,
  hasActiveFilters,
  activeFilterCount,
  className,
}) => (
  <Button
    type="button"
    variant={hasActiveFilters ? 'default' : 'outline'}
    size="sm"
    className={cn('at-show-filter-trigger', className)}
    onClick={onClick}
  >
    Filter
    {typeof activeFilterCount === 'number' && activeFilterCount > 0 && (
      <span className="at-show-filter-count ml-1">{activeFilterCount}</span>
    )}
  </Button>
);

/** Slide-over panel with search input + sort radio options. */
const FilterPanel: React.FC<FilterPanelProps> = ({
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
    onOpenChange={(open) => {
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
          onChange={(e) => onSearchChange(e.target.value)}
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Sort by</legend>
          {sortOptions.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="at-show-sort-order"
                value={option.value}
                checked={sortOrder === option.value}
                onChange={() => onSortChange(option.value)}
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

// ---------------------------------------------------------------------------
// List body
// ---------------------------------------------------------------------------

/** Maps a status-border variant to a left-border color class. */
const statusBorderClass = (border: DogCardStatusBorder | undefined): string => {
  switch (border) {
    case 'checked-in':
    case 'at-gate':
    case 'come-to-gate':
      return 'border-l-4 border-l-blue-500';
    case 'in-ring':
      return 'border-l-4 border-l-amber-500';
    case 'conflict':
    case 'result-nq':
    case 'result-ex':
      return 'border-l-4 border-l-red-500';
    case 'pulled':
    case 'result-wd':
    case 'result-abs':
      return 'border-l-4 border-l-gray-400';
    case 'completed':
    case 'scored':
    case 'result-qualified':
      return 'border-l-4 border-l-green-500';
    case 'placement-1':
      return 'border-l-4 border-l-yellow-500';
    case 'placement-2':
      return 'border-l-4 border-l-slate-400';
    case 'placement-3':
      return 'border-l-4 border-l-orange-400';
    case 'no-status':
    default:
      return 'border-l-4 border-l-transparent';
  }
};

/**
 * Per-entry card. Renders the dog info, fires onClick/onPrefetch, and
 * renders the injected actionButton / resultBadges / dragHandle /
 * sectionBadge slots.
 */
const DogCard: React.FC<DogCardProps> = ({
  armband,
  callName,
  breed,
  handler,
  onClick,
  className,
  statusBorder,
  actionButton,
  resultBadges,
  sectionBadge,
  onPrefetch,
  dragHandle,
}) => (
  <Card
    className={cn('at-show-dog-card', statusBorderClass(statusBorder), className)}
    onClick={onClick}
    {...(onPrefetch
      ? { onMouseEnter: onPrefetch, onFocus: onPrefetch }
      : {})}
  >
    <CardContent className="flex items-center gap-3 p-3">
      {dragHandle && <span className="at-show-dog-card-drag">{dragHandle}</span>}
      <span className="at-show-dog-card-armband font-semibold">#{armband}</span>
      <div className="at-show-dog-card-info min-w-0 flex-1">
        <div className="at-show-dog-card-name truncate font-medium">
          {callName}
          {sectionBadge && (
            <span className="at-show-dog-card-section ml-1 text-xs">[{sectionBadge}]</span>
          )}
        </div>
        <div className="at-show-dog-card-breed truncate text-sm text-muted-foreground">
          {breed}
        </div>
        <div className="at-show-dog-card-handler truncate text-sm text-muted-foreground">
          {handler}
        </div>
      </div>
      {resultBadges && <span className="at-show-dog-card-badges">{resultBadges}</span>}
      {actionButton && <span className="at-show-dog-card-action">{actionButton}</span>}
    </CardContent>
  </Card>
);

/**
 * Pull-to-refresh wrapper. Spike renders children directly — no gesture
 * handling yet. `onRefresh` is unused intentionally until the gesture
 * lands in the UI sprint.
 */
const PullToRefresh: React.FC<PullToRefreshProps> = ({ children, className }) => (
  <div className={cn('at-show-pull-to-refresh', className)}>{children}</div>
);

/** Fetch-error fallback. Wraps the shared DelightfulError component. */
const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry, className }) => (
  <div className={cn('at-show-error-state', className)}>
    <DelightfulError
      variant="component"
      {...(message ? { message } : {})}
      {...(onRetry ? { reset: onRetry } : {})}
    />
  </div>
);

// ---------------------------------------------------------------------------
// Class-info popover
// ---------------------------------------------------------------------------

/**
 * Read-only class details popover. Spike renders a controlled popover
 * with the `data` fields. Base UI's popover has no real anchor element,
 * so `anchorRef` is accepted for contract conformance but not consumed
 * yet — positioning lands in the UI sprint.
 */
const ClassDetailsPopover: React.FC<ClassDetailsPopoverProps> = ({
  isOpen,
  onClose,
  data,
  showJudgeB,
}) => (
  <Popover
    open={isOpen}
    onOpenChange={(open) => {
      if (!open) onClose();
    }}
  >
    <PopoverContent className="at-show-class-details">
      <dl className="space-y-1 text-sm">
        {data.judgeName && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Judge</dt>
            <dd>{data.judgeName}</dd>
          </div>
        )}
        {showJudgeB && data.judgeNameB && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Judge B</dt>
            <dd>{data.judgeNameB}</dd>
          </div>
        )}
        {typeof data.totalEntries === 'number' && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Entries</dt>
            <dd>
              {typeof data.completedEntries === 'number'
                ? `${data.completedEntries} / ${data.totalEntries}`
                : data.totalEntries}
            </dd>
          </div>
        )}
        {typeof data.areaCount === 'number' && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Areas</dt>
            <dd>{data.areaCount}</dd>
          </div>
        )}
        {typeof data.timeLimitSeconds === 'number' && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Time limit</dt>
            <dd>{data.timeLimitSeconds}s</dd>
          </div>
        )}
        {data.visibilityPreset && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Visibility</dt>
            <dd>{data.visibilityPreset}</dd>
          </div>
        )}
      </dl>
    </PopoverContent>
  </Popover>
);

// ---------------------------------------------------------------------------
// Assembled slot bag
// ---------------------------------------------------------------------------

export const atShowLayoutSlots: EntryListLayoutSlots = {
  HamburgerMenu,
  CompactOfflineIndicator,
  SyncIndicator,
  RefreshIndicator,
  FilterTriggerButton,
  FilterPanel,
  DogCard,
  PullToRefresh,
  ErrorState,
  ClassDetailsPopover,
};
