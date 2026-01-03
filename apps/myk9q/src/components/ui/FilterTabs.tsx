import React from 'react';
import './shared-ui.css';

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

/**
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
export const FilterTabs: React.FC<FilterTabsProps> = ({
  tabs,
  activeFilter,
  onFilterChange,
  onTabClick,
  className = ''
}) => {
  const handleTabClick = (value: string) => {
    if (onTabClick) {
      onTabClick();
    }
    onFilterChange(value);
  };

  return (
    <div className={`filter-tabs ${className}`.trim()}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          className={`tab-button ${activeFilter === tab.value ? 'active' : ''}`}
          onClick={() => handleTabClick(tab.value)}
        >
          {tab.icon && <span className="tab-icon">{tab.icon}</span>}
          <span className="tab-text">
            {tab.label}
            {tab.count !== undefined && ` (${tab.count})`}
          </span>
        </button>
      ))}
    </div>
  );
};
