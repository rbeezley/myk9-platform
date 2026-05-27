import React from 'react';
import { cn } from '@myk9/ui';

/** Tailwind styles for ClassCardSkeleton */
const styles = {
  card: cn(
    "class-card cursor-default pointer-events-none min-h-[200px]"
  ),
  content: "class-content gap-4",
  icon: cn(
    "w-10 h-10 rounded-full animate-pulse",
    "bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200",
    "dark:from-gray-700 dark:via-gray-600 dark:to-gray-700",
    "bg-[length:200%_100%]"
  ),
  className: cn(
    "h-6 w-[70%] rounded animate-pulse mb-2",
    "bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200",
    "dark:from-gray-700 dark:via-gray-600 dark:to-gray-700",
    "bg-[length:200%_100%]"
  ),
  judgeName: cn(
    "h-4 w-1/2 rounded animate-pulse",
    "bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200",
    "dark:from-gray-700 dark:via-gray-600 dark:to-gray-700",
    "bg-[length:200%_100%]"
  ),
  infoRow: "flex gap-4 mt-4",
  infoItem: cn(
    "h-5 w-20 rounded animate-pulse",
    "bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200",
    "dark:from-gray-700 dark:via-gray-600 dark:to-gray-700",
    "bg-[length:200%_100%]"
  ),
  statusBadge: cn(
    "h-8 w-32 rounded-full animate-pulse mt-4",
    "bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200",
    "dark:from-gray-700 dark:via-gray-600 dark:to-gray-700",
    "bg-[length:200%_100%]"
  ),
  preview: cn(
    "h-4 w-full rounded animate-pulse mt-2",
    "bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200",
    "dark:from-gray-700 dark:via-gray-600 dark:to-gray-700",
    "bg-[length:200%_100%]"
  ),
};

export const ClassCardSkeleton: React.FC = () => {
  return (
    <div className={styles.card}>
      <div className={styles.content}>
        <div className="class-header">
          <div className="class-actions">
            <div className={styles.icon} />
            <div className={styles.icon} />
          </div>

          <div className="class-title-section">
            <div className={styles.className} />
            <div className={styles.judgeName} />
          </div>
        </div>

        <div className="class-info">
          <div className={styles.infoRow}>
            <div className={styles.infoItem} />
            <div className={styles.infoItem} />
            <div className={styles.infoItem} />
          </div>
        </div>

        <div className="class-status-section">
          <div className={styles.statusBadge} />
          <div className={styles.preview} />
        </div>
      </div>
    </div>
  );
};

interface ClassCardSkeletonListProps {
  count?: number;
}

export const ClassCardSkeletonList: React.FC<ClassCardSkeletonListProps> = ({ count = 3 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <ClassCardSkeleton key={i} />
      ))}
    </>
  );
};
