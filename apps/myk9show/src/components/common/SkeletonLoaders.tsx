/**
 * SkeletonLoaders - Specialized loading skeletons for different page types
 *
 * Provides context-aware loading states that match the expected content layout
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

// Base skeleton component
const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse bg-muted rounded-md', className)} />
);

// Dashboard skeleton
export const DashboardSkeleton: React.FC = () => (
  <div className="container mx-auto p-6 space-y-6">
    {/* Header skeleton */}
    <div className="space-y-2">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
    </div>

    {/* Stats cards skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="p-4 border rounded-lg space-y-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>

    {/* Main content skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Skeleton className="h-64 w-full" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-4 p-3 border rounded">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  </div>
);

// Table skeleton
export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 5,
  columns = 4,
}) => (
  <div className="space-y-4">
    {/* Table header skeleton */}
    <div className="flex space-x-4 p-4 border rounded-t-lg">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>

    {/* Table rows skeleton */}
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={rowIndex} className="flex space-x-4 p-4 border-l border-r border-b">
        {Array.from({ length: columns }).map((_, colIndex) => (
          <Skeleton key={colIndex} className="h-4 flex-1" />
        ))}
      </div>
    ))}
  </div>
);

// Form skeleton
export const FormSkeleton: React.FC = () => (
  <div className="space-y-6 max-w-2xl">
    <div className="space-y-2">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>

    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>

    <div className="flex space-x-4">
      <Skeleton className="h-10 w-24" />
      <Skeleton className="h-10 w-32" />
    </div>
  </div>
);

// Card grid skeleton
export const CardGridSkeleton: React.FC<{ items?: number }> = ({ items = 6 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {Array.from({ length: items }).map((_, i) => (
      <div key={i} className="p-6 border rounded-lg space-y-4">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <div className="flex justify-between items-center">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    ))}
  </div>
);

// Calendar skeleton
export const CalendarSkeleton: React.FC = () => {
  // Pre-compute which days have extra content to avoid Math.random() during render
  const daysWithContent = useMemo(() => {
    // Show content on roughly 30% of days (indices: 2, 5, 9, 14, 18, 23, 27, 31)
    return new Set([2, 5, 9, 14, 18, 23, 27, 31]);
  }, []);

  return (
    <div className="space-y-4">
      {/* Calendar header */}
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-48" />
        <div className="flex space-x-2">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-10" />
        </div>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Week headers */}
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="p-2 text-center">
            <Skeleton className="h-4 w-8 mx-auto" />
          </div>
        ))}

        {/* Calendar days */}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="p-2 h-24 border">
            <Skeleton className="h-4 w-6 mb-2" />
            {daysWithContent.has(i) && (
              <div className="space-y-1">
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-3/4" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Detail page skeleton
export const DetailPageSkeleton: React.FC = () => (
  <div className="container mx-auto p-6 space-y-8">
    {/* Breadcrumb skeleton */}
    <div className="flex items-center space-x-2">
      <Skeleton className="h-4 w-16" />
      <span className="text-muted-foreground">/</span>
      <Skeleton className="h-4 w-20" />
      <span className="text-muted-foreground">/</span>
      <Skeleton className="h-4 w-24" />
    </div>

    {/* Page header */}
    <div className="flex justify-between items-start">
      <div className="space-y-2">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-5 w-64" />
      </div>
      <div className="flex space-x-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>

    {/* Content grid */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        {/* Main content sections */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-6 border rounded-lg space-y-4">
            <Skeleton className="h-6 w-40" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="p-4 border rounded-lg space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Navigation skeleton
export const NavigationSkeleton: React.FC = () => (
  <div className="flex items-center space-x-6 p-4">
    <Skeleton className="h-8 w-32" />
    <div className="flex space-x-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-6 w-16" />
      ))}
    </div>
    <div className="ml-auto flex items-center space-x-4">
      <Skeleton className="h-8 w-8 rounded-full" />
      <Skeleton className="h-6 w-20" />
    </div>
  </div>
);

// Enhanced show-specific skeletons for unified interface
export const ShowCardGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="apple-browse-card animate-pulse">
        <div className="apple-browse-card-header">
          <div className="apple-browse-card-badges">
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
        <div className="apple-browse-card-content">
          <Skeleton className="h-6 w-3/4 mb-2" />
          <Skeleton className="h-4 w-1/2 mb-4" />

          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="apple-browse-card-detail-item">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>

          <div className="apple-browse-card-footer">
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
  viewMode: 'grid' | 'list' | 'calendar';
  count?: number;
}> = ({ viewMode, count = 6 }) => {
  switch (viewMode) {
    case 'calendar':
      return <ShowCalendarSkeleton />;
    case 'list':
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
  viewMode?: 'grid' | 'list' | 'calendar';
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

/**
 * Browse clubs page skeleton with card grid
 */
export const BrowseClubsSkeleton: React.FC<{ viewMode?: 'grid' | 'list' }> = ({
  viewMode = 'grid',
}) => (
  <div className="space-y-8">
    {/* Breadcrumb */}
    <div className="flex items-center gap-2">
      <Skeleton className="h-4 w-4" />
      <Skeleton className="h-3 w-12" />
    </div>

    {/* Header */}
    <div className="flex justify-between items-start">
      <div className="space-y-2">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-72" />
      </div>
      <Skeleton className="h-10 w-28 rounded-lg" />
    </div>

    {/* Search bar */}
    <Skeleton className="h-14 w-full rounded-2xl" />

    {/* View toggle + count */}
    <div className="flex justify-between items-center">
      <Skeleton className="h-8 w-32 rounded-lg" />
      <Skeleton className="h-4 w-20" />
    </div>

    {/* Cards */}
    {viewMode === 'grid' ? (
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-6 rounded-2xl bg-card/50 border space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-6 w-40" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-6 rounded-xl bg-card/50 border flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        ))}
      </div>
    )}
  </div>
);

/**
 * Browse Dogs page skeleton (grid/list of dog cards)
 */
export const BrowseDogsSkeleton: React.FC<{ viewMode?: 'grid' | 'list' }> = ({
  viewMode = 'grid',
}) => (
  <div className="space-y-8">
    {/* Breadcrumb */}
    <div className="flex items-center gap-2">
      <Skeleton className="h-4 w-4" />
      <Skeleton className="h-3 w-12" />
    </div>

    {/* Header */}
    <div className="flex justify-between items-start">
      <div className="space-y-2">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-72" />
      </div>
      <Skeleton className="h-10 w-28 rounded-lg" />
    </div>

    {/* Search bar */}
    <Skeleton className="h-14 w-full rounded-2xl" />

    {/* View toggle + count */}
    <div className="flex justify-between items-center">
      <Skeleton className="h-8 w-32 rounded-lg" />
      <Skeleton className="h-4 w-20" />
    </div>

    {/* Cards */}
    {viewMode === 'grid' ? (
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-6 rounded-2xl bg-card/50 border space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-6 w-36" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-6 rounded-xl bg-card/50 border flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        ))}
      </div>
    )}
  </div>
);

/**
 * Profile page skeleton (for Dogs, Users pages)
 */
export const ProfilePageSkeleton: React.FC = () => (
  <div className="flex min-h-screen bg-background">
    {/* Sidebar skeleton */}
    <div className="w-72 border-r bg-card/50 p-4 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="space-y-2 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Main content */}
    <div className="flex-1 p-8">
      {/* Profile header */}
      <div className="flex items-start gap-6 mb-8">
        <Skeleton className="h-24 w-24 rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-24" />
        ))}
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-6 rounded-2xl bg-card/50 border space-y-4">
            <Skeleton className="h-5 w-32" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export { Skeleton };
