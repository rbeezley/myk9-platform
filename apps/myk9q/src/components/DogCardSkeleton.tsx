import React from 'react';
import { cn } from '@/lib/utils';

/** Tailwind styles for DogCardSkeleton */
const styles = {
  skeleton: "cursor-default pointer-events-none",
  contentGap: "gap-4",
  shimmer: cn(
    "animate-pulse",
    "bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200",
    "dark:from-gray-700 dark:via-gray-600 dark:to-gray-700",
    "bg-[length:200%_100%]",
    "motion-reduce:animate-none motion-reduce:bg-[var(--surface-muted)]",
    "dark:motion-reduce:bg-[var(--muted)]"
  ),
  armband: "w-14 h-14 min-w-14 min-h-14 rounded-2xl",
  name: "h-5 w-3/5 rounded mb-1",
  breed: "h-3.5 w-3/4 rounded mb-1",
  handler: "h-3.5 w-1/2 rounded",
  action: "w-20 h-8 rounded-full",
};

export const DogCardSkeleton: React.FC = () => {
  return (
    <div className={cn("dog-card", styles.skeleton)}>
      <div className={cn("dog-card-content", styles.contentGap)}>
        <div className="dog-card-armband">
          <div className={cn(styles.armband, styles.shimmer)} />
        </div>

        <div className="dog-card-details">
          <div className={cn(styles.name, styles.shimmer)} />
          <div className={cn(styles.breed, styles.shimmer)} />
          <div className={cn(styles.handler, styles.shimmer)} />
        </div>

        <div className="dog-card-action">
          <div className={cn(styles.action, styles.shimmer)} />
        </div>
      </div>
    </div>
  );
};

interface DogCardSkeletonListProps {
  count?: number;
}

export const DogCardSkeletonList: React.FC<DogCardSkeletonListProps> = ({ count = 5 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <DogCardSkeleton key={i} />
      ))}
    </>
  );
};
