import React from 'react';
import { cn } from '@myk9/ui';

/**
 * Tailwind-only styles for ClassCardSkeleton.
 *
 * The skeleton was originally co-located with apps/myk9q's ClassList page
 * and relied on semantic wrappers (`class-card`, `class-content`,
 * `class-header`, `class-actions`, `class-title-section`,
 * `class-info`, `class-status-section`) defined in
 * `apps/myk9q/src/pages/ClassList/ClassList.css`. Now that the
 * component ships from `@myk9/ringside`, those host-only rules are NOT
 * in `@myk9/ringside/styles` — any consumer importing the package's
 * documented CSS contract would get a broken layout.
 *
 * Layout positions are approximate replicas of the live ClassCard so
 * the skeleton-to-real transition doesn't cause visible layout shift.
 * Pixel-perfect fidelity isn't required — this is placeholder chrome.
 */
const shimmer = cn(
  'animate-pulse',
  'bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200',
  'dark:from-gray-700 dark:via-gray-600 dark:to-gray-700',
  'bg-[length:200%_100%]'
);

const styles = {
  card: cn(
    'relative overflow-visible rounded-xl border border-solid border-gray-200',
    'dark:border-gray-700 bg-gray-50 dark:bg-gray-900 shadow-sm',
    'cursor-default pointer-events-none min-h-[200px]'
  ),
  content: 'flex flex-col w-full gap-4 px-4 pt-4 pb-2',
  // Header reserves space on the right for two action-button placeholders
  // (matches the live card's `padding-right: 5.5rem`).
  header: 'relative w-full pr-[5.5rem] min-h-[44px]',
  // Action buttons floated to the upper-right of the header, matching
  // the live card's absolute-positioned action cluster.
  actions: 'absolute top-10 right-2 flex flex-row gap-1.5 items-center',
  titleSection: 'flex flex-col text-left',
  icon: cn('w-10 h-10 rounded-full', shimmer),
  className: cn('h-6 w-[70%] rounded mb-2', shimmer),
  judgeName: cn('h-4 w-1/2 rounded', shimmer),
  infoRow: 'flex gap-4 mt-4',
  infoItem: cn('h-5 w-20 rounded', shimmer),
  statusBadge: cn('h-8 w-32 rounded-full mt-4', shimmer),
  preview: cn('h-4 w-full rounded mt-2', shimmer),
};

export const ClassCardSkeleton: React.FC = () => {
  return (
    <div className={styles.card}>
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.actions}>
            <div className={styles.icon} />
            <div className={styles.icon} />
          </div>

          <div className={styles.titleSection}>
            <div className={styles.className} />
            <div className={styles.judgeName} />
          </div>
        </div>

        <div>
          <div className={styles.infoRow}>
            <div className={styles.infoItem} />
            <div className={styles.infoItem} />
            <div className={styles.infoItem} />
          </div>
        </div>

        <div>
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
