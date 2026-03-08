/**
 * Show-specific skeleton loaders
 *
 * Specialized loading skeletons for the Shows browse pages,
 * including grid/list/calendar views and page header.
 */

import React from 'react';
import { cn } from '@/lib/utils';

// Base skeleton component (local copy to avoid circular deps)
const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse bg-muted rounded-md', className)} />
);

// Enhanced show-specific skeletons for unified interface
export const ShowCardGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="myk9-browse-card animate-pulse">
        <div className="myk9-browse-card-header">
          <div className="myk9-browse-card-badges">
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
        <div className="myk9-browse-card-content">
          <Skeleton className="h-6 w-3/4 mb-2" />
          <Skeleton className="h-4 w-1/2 mb-4" />

          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="myk9-browse-card-detail-item">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>

          <div className="myk9-browse-card-footer">
            <Skeleton className="h-5 w-20 rounded-full" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const ShowCardListSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div className="space-y-4">
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="bg-card/95 backdrop-blur-sm border-border/50 rounded-xl p-6 animate-pulse"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <div className="flex gap-2 ml-4">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const ShowCalendarSkeleton: React.FC = () => (
  <div className="bg-card/95 backdrop-blur-sm border-border/50 rounded-xl p-6 animate-pulse">
    <div className="space-y-4">
      {/* Calendar header */}
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>

      {/* Calendar header with days */}
      <div className="grid grid-cols-7 gap-2 mb-4">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div
            key={day}
            className="h-8 bg-muted rounded text-center flex items-center justify-center text-xs font-medium"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted/50 rounded border border-border/30 p-1">
            {i % 7 === 0 || i % 7 === 3 || i % 7 === 5 ? (
              <div className="space-y-1">
                <Skeleton className="h-2 w-4" />
                <Skeleton className="h-3 w-full" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const ShowsPageHeaderSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse">
    {/* Breadcrumb skeleton */}
    <div className="flex items-center gap-2">
      <Skeleton className="h-4 w-4" />
      <Skeleton className="h-3 w-12" />
      <Skeleton className="h-3 w-3" />
      <Skeleton className="h-3 w-16" />
    </div>

    {/* Header skeleton */}
    <div className="flex justify-between items-start">
      <div className="space-y-2">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-6 w-96" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-28" />
      </div>
    </div>

    {/* Filters skeleton */}
    <div className="bg-card/95 backdrop-blur-sm border-border/50 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </div>

    {/* View mode and tabs skeleton */}
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-10" />
          <div className="flex bg-muted/50 rounded-lg p-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-16 mx-1" />
            ))}
          </div>
        </div>
      </div>

      <div className="flex bg-muted/50 rounded-lg p-1 h-12">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="flex-1 h-10 mx-1" />
        ))}
      </div>
    </div>
  </div>
);

/**
 * Tab content skeleton that adapts to view mode
 */
export const TabContentSkeleton: React.FC<{
  viewMode: 'grid' | 'list' | 'table' | 'calendar' | 'kanban';
  count?: number;
}> = ({ viewMode, count = 6 }) => {
  switch (viewMode) {
    case 'calendar':
      return <ShowCalendarSkeleton />;
    case 'list':
    case 'table':
      return <ShowCardListSkeleton count={count} />;
    case 'grid':
    default:
      return <ShowCardGridSkeleton count={count} />;
  }
};

/**
 * Complete shows page skeleton
 */
export const ShowsPageSkeleton: React.FC<{
  viewMode?: 'grid' | 'list' | 'table' | 'calendar' | 'kanban';
  count?: number;
}> = ({ viewMode = 'grid', count = 6 }) => (
  <div className="min-h-screen bg-background">
    <div className="container mx-auto px-6 py-20 max-w-7xl">
      <div className="space-y-8">
        <ShowsPageHeaderSkeleton />
        <TabContentSkeleton viewMode={viewMode} count={count} />
      </div>
    </div>
  </div>
);
