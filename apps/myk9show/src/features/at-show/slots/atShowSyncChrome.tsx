import React from 'react';
import {
  AlertCircle,
  CheckCircle,
  CloudOff,
  CloudUpload,
  RefreshCw,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { FilterTriggerButtonProps, SyncIndicatorProps } from '@myk9/ringside';
import { OfflineScoresIndicator } from '@myk9/scoring-ui';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { OfflineStatusLine } from '@/features/offline-readiness/OfflineStatusLine';
import { badgeClass, getSyncLabel, getSyncTier } from './atShowChrome.helpers';

/**
 * The header chrome the ringside entry-list bar is made of, kept free of the sync provider and
 * Supabase client so a hermetic geometry spec can render the real markup (MYK9-1899).
 */

/** The offline note: icon-only popover button on phones, the amber wrapping line from `sm`. */
export const OfflineSyncNoteView: React.FC<{ label: string; className?: string | undefined }> = ({
  label,
  className,
}) => (
  <>
    <span className="inline-flex sm:hidden">
      <OfflineScoresIndicator isOnline={false} message={label} />
    </span>
    <OfflineStatusLine
      note={label}
      className={cn(
        'at-show-offline-indicator min-w-0 gap-1.5 text-xs font-medium max-sm:hidden',
        className
      )}
    />
  </>
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
      {/* Compact (the ringside header row): phones keep the icon and count only, like
          CompactOfflineIndicator, so the pill cannot squeeze the class title away. */}
      <span className={cn(compact && 'max-sm:sr-only')}>{label}</span>
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
          Try again
        </button>
      )}
    </span>
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
