import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export const DogEditPanelSkeleton: React.FC = () => (
  <div className="p-6 space-y-6">
    <div className="space-y-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
    <div className="flex justify-end gap-2">
      <Skeleton className="h-10 w-20" />
      <Skeleton className="h-10 w-24" />
    </div>
  </div>
);

export const DeleteDialogSkeleton: React.FC = () => (
  <div className="p-6 space-y-4">
    <Skeleton className="h-6 w-48" />
    <Skeleton className="h-4 w-72" />
    <div className="flex justify-end gap-2 pt-4">
      <Skeleton className="h-10 w-20" />
      <Skeleton className="h-10 w-20" />
    </div>
  </div>
);

export const PhotoDialogSkeleton: React.FC = () => (
  <div className="p-6 space-y-4">
    <Skeleton className="h-6 w-40" />
    <Skeleton className="h-48 w-full rounded-lg" />
    <div className="flex justify-end gap-2">
      <Skeleton className="h-10 w-20" />
      <Skeleton className="h-10 w-20" />
    </div>
  </div>
);

export const TabContentSkeleton: React.FC = () => (
  <div className="pt-6 space-y-6">
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="flex justify-between items-center pt-4">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
    </Card>
  </div>
);

/** The dog page's loading state: also shown while the viewer's relationship to the dog is unresolved. */
export const DogPageSkeleton: React.FC = () => (
  <div role="status" aria-label="Loading dog" className="space-y-6">
    <div className="h-8 w-48 bg-muted/50 rounded-lg animate-pulse" />
    <div className="flex gap-6">
      <div className="h-48 w-48 bg-muted/50 rounded-xl animate-pulse shrink-0" />
      <div className="flex-1 space-y-4">
        <div className="h-6 w-64 bg-muted/50 rounded animate-pulse" />
        <div className="h-4 w-40 bg-muted/50 rounded animate-pulse" />
        <div className="h-4 w-56 bg-muted/50 rounded animate-pulse" />
        <div className="h-4 w-32 bg-muted/50 rounded animate-pulse" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />
      ))}
    </div>
  </div>
);
