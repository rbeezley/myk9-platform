import React from 'react';

export interface StatsGridProps {
  /** Number of columns in the grid (2–5). Collapses to 1 col on mobile, 2 on sm. */
  columns?: 2 | 3 | 4 | 5;
  /** Additional CSS classes */
  className?: string;
  children: React.ReactNode;
}

const COLUMN_CLASSES: Record<number, string> = {
  2: 'grid grid-cols-1 sm:grid-cols-2 gap-4',
  3: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4',
  4: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4',
  5: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4',
};

export const StatsGrid: React.FC<StatsGridProps> = ({ columns = 4, className, children }) => {
  const gridClass = COLUMN_CLASSES[columns] ?? COLUMN_CLASSES[4];

  return <div className={className ? `${gridClass} ${className}` : gridClass}>{children}</div>;
};
