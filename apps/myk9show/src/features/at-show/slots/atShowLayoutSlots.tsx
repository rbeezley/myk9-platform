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
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Popover, PopoverContent } from '@/components/ui/popover';
import DelightfulError from '@/components/ui/DelightfulError';
// Phase 1h-0: the per-entry card is now the myK9Q-faithful ringside DogCard
// (styled via `@myk9/ringside/styles`, scoped under `.ringside-root`), not a
// local shadcn placeholder. The remaining slots stay host-owned for now.
import { DogCard } from '@myk9/ringside';
import type {
  EntryListLayoutSlots,
  HamburgerMenuProps,
  CompactOfflineIndicatorProps,
  SyncIndicatorProps,
  RefreshIndicatorProps,
  FilterTriggerButtonProps,
  FilterPanelProps,
  PullToRefreshProps,
  ErrorStateProps,
  ClassDetailsPopoverProps,
} from '@myk9/ringside';

// ---------------------------------------------------------------------------
// Header chrome
// ---------------------------------------------------------------------------

/**
 * Top-left nav. Renders a COMPACT icon-only back affordance (not a wide text
 * button) so it doesn't collide with the absolute-centered class title — the
 * ringside header reserves the center for the title and assumes a compact left
 * control, mirroring myK9Q's hamburger. The full drawer lands in the UI sprint.
 */
const HamburgerMenu: React.FC<HamburgerMenuProps> = ({ backNavigation, className }) => {
  if (!backNavigation) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={backNavigation.label}
      title={backNavigation.label}
      className={cn('at-show-hamburger-back', className)}
      onClick={backNavigation.action}
    >
      <ArrowLeft size={20} />
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

/**
 * Icon button that opens the Search & Sort slide-out (the FilterPanel slot).
 * Mirrors myK9Q: a compact sliders/tune ICON (not a "Filter" text button), with
 * a small dot when filters are active.
 */
const FilterTriggerButton: React.FC<FilterTriggerButtonProps> = ({
  onClick,
  hasActiveFilters,
  className,
}) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    aria-label="Search & sort"
    title="Search & sort"
    className={cn('at-show-filter-trigger relative', className)}
    onClick={onClick}
  >
    <SlidersHorizontal size={20} />
    {hasActiveFilters && (
      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--primary,#14b8a6)]" />
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
//
// DogCard is no longer defined here — it's the myK9Q-faithful ringside
// `DogCard` imported from `@myk9/ringside` (see imports). It carries its own
// status-border / armband / section-badge styling via the package stylesheet,
// so the local shadcn placeholder + statusBorderClass helper were removed.

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
