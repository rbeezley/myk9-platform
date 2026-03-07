/**
 * Browse page skeleton loaders
 *
 * Specialized loading skeletons for the Browse pages (Clubs, Dogs, People)
 * and Profile page layouts.
 */

import React from 'react';
import { cn } from '@/lib/utils';

// Base skeleton component (local copy to avoid circular deps)
const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse bg-muted rounded-md', className)} />
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
export const BrowseDogsSkeleton: React.FC<{ viewMode?: 'grid' | 'list' | 'table' }> = ({
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
 * Browse People page skeleton (grid/list of people cards)
 */
export const BrowsePeopleSkeleton: React.FC<{ viewMode?: 'grid' | 'list' | 'table' }> = ({
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
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-1">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
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
