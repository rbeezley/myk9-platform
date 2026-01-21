import React from 'react';
import { cn } from '../../lib/utils';

/**
 * FilterTabs Component - Migrated to Tailwind CSS
 *
 * Reusable filter tabs component
 * Displays horizontal tabs with icons and optional counts
 *
 * @example
 * <FilterTabs
 *   tabs={[
 *     { value: 'pending', label: 'Pending', icon: <Clock />, count: 10 },
 *     { value: 'completed', label: 'Completed', icon: <CheckCircle />, count: 5 }
 *   ]}
 *   activeFilter={filter}
 *   onFilterChange={setFilter}
 * />
 */

export interface FilterTab {
  value: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export interface FilterTabsProps {
  /** Available filter tabs */
  tabs: FilterTab[];
  /** Currently active filter */
  activeFilter: string;
  /** Filter change handler */
  onFilterChange: (filter: string) => void;
  /** Optional haptic feedback function */
  onTabClick?: () => void;
  /** Additional CSS class */
  className?: string;
}

export const FilterTabs: React.FC<FilterTabsProps> = ({
  tabs,
  activeFilter,
  onFilterChange,
  onTabClick,
  className,
}) => {
  const handleTabClick = (value: string) => {
    if (onTabClick) {
      onTabClick();
    }
    onFilterChange(value);
  };

  return (
    <div
      className={cn(
        'flex gap-2 p-1',
        'bg-[var(--muted)]/50 rounded-xl',
        'overflow-x-auto',
        className
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          className={cn(
            'flex items-center gap-2',
            'px-4 py-2.5 rounded-lg',
            'text-sm font-medium',
            'whitespace-nowrap',
            'min-h-[44px]',
            'transition-all duration-200',
            'border-none cursor-pointer',
            activeFilter === tab.value
              ? 'bg-[var(--card)] text-[var(--primary)] shadow-sm'
              : 'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          )}
          onClick={() => handleTabClick(tab.value)}
        >
          {tab.icon && (
            <span className="flex-shrink-0 w-4 h-4">{tab.icon}</span>
          )}
          <span>
            {tab.label}
            {tab.count !== undefined && ` (${tab.count})`}
          </span>
        </button>
      ))}
    </div>
  );
};
