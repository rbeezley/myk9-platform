/**
 * SkeletonLoaders - Specialized loading skeletons for different page types
 *
 * Provides context-aware loading states that match the expected content layout.
 * Show-specific and browse-page skeletons are in sibling modules and re-exported here.
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

export { Skeleton };

// Re-export show-specific skeletons
export {
  ShowCardGridSkeleton,
  ShowCardListSkeleton,
  ShowCalendarSkeleton,
  ShowsPageHeaderSkeleton,
  TabContentSkeleton,
  ShowsPageSkeleton,
} from './SkeletonLoadersShows';

// Re-export browse page skeletons
export {
  BrowseClubsSkeleton,
  BrowseDogsSkeleton,
  BrowsePeopleSkeleton,
  ProfilePageSkeleton,
} from './SkeletonLoadersBrowse';
