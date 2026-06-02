import React from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  CloudOff,
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
import { cn } from '@/lib/utils';
import { badgeClass, getSyncLabel, getSyncTier } from './atShowChrome.helpers';

export const HamburgerMenu: React.FC<HamburgerMenuProps> = ({ backNavigation, className }) => {
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

export const CompactOfflineIndicator: React.FC<CompactOfflineIndicatorProps> = ({ className }) => (
  <span
    className={cn(
      'at-show-offline-indicator inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
      badgeClass('neutral'),
      className
    )}
  >
    <CloudOff size={13} className="shrink-0" />
    Offline
  </span>
);

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
          className="ml-0.5 rounded bg-foreground/10 px-2 py-0.5 text-xs font-medium transition-colors hover:bg-foreground/20"
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
      className={cn('at-show-refresh-indicator text-center text-xs text-muted-foreground', className)}
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

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ children, className }) => (
  <div className={cn('at-show-pull-to-refresh', className)}>{children}</div>
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
