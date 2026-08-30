/**
 * Load / empty states shared by the single-class and combined A/B entry list.
 *
 * Extracted from `EntryListPage` during the MYK9-260 collapse: the two pages
 * carried near-identical copies of both, and the copies had already drifted
 * (the combined empty state offered no way back, and its skeleton shimmered
 * forever on a class that genuinely had no entries). One implementation makes
 * that drift impossible; the section-tab row and the description are the only
 * things the two modes legitimately differ on.
 */
import React from 'react';
import { ArrowLeft, Users } from 'lucide-react';

export interface EntryListSkeletonProps {
  /** Combined A/B renders an extra tab row, so its skeleton reserves one. */
  showSectionTabs?: boolean;
  /**
   * Accessible name. Combined A/B says "Loading combined entries" -- a screen
   * reader user is told which of the two lists is loading, which the shared
   * default cannot convey.
   */
  label?: string;
}

export const EntryListSkeleton: React.FC<EntryListSkeletonProps> = ({
  showSectionTabs = false,
  label = 'Loading entries',
}) => (
  <div role="status" aria-label={label} className="space-y-4 p-3">
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-5 w-44 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-28 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
      </div>
    </div>
    {showSectionTabs && (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-10 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )}
    <div className="grid grid-cols-2 gap-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-12 animate-pulse rounded-lg bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="h-7 w-16 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export interface EntryListEmptyStateProps {
  className?: string | undefined;
  description: string;
  onGoBack: () => void;
}

export const EntryListEmptyState: React.FC<EntryListEmptyStateProps> = ({
  className,
  description,
  onGoBack,
}) => (
  <div className="p-3">
    <div className="flex flex-col items-center justify-center gap-2 px-3 py-8 text-center text-muted-foreground">
      {/* These used semantic class names (`empty-state-icon`, `btn
          btn-secondary`, ...) that have had NO CSS since the Tailwind
          migration deleted ringside.css -- so "Go Back" rendered as an
          unstyled browser default with no 44px target. */}
      <Users size={48} aria-hidden="true" />
      <h2 className="m-0 text-lg font-semibold text-foreground">No Entries Yet</h2>
      {className && <p className="text-sm font-medium">{className}</p>}
      <p className="max-w-sm text-sm">{description}</p>
      <button
        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onGoBack}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Go Back
      </button>
    </div>
  </div>
);
