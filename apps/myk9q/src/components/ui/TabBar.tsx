import React from 'react';
import { cn } from '../../lib/utils';

export interface Tab {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
  /** Optional element to render on the right side of the tab bar (e.g., filter button) */
  rightElement?: React.ReactNode;
  /** Variant: 'default' | 'compact' | 'full-width' */
  variant?: 'default' | 'compact' | 'full-width';
}

/**
 * TabBar - Standardized tab navigation component - Migrated to Tailwind CSS
 *
 * Features:
 * - iOS-style segmented control design
 * - Optional icons and count badges
 * - Theme-aware colors (adapts to blue/green/orange themes)
 * - Mobile-optimized touch targets (min 44px height)
 * - Smooth animations
 *
 * Usage:
 * ```tsx
 * <TabBar
 *   tabs={[
 *     { id: 'pending', label: 'Pending', count: 20, icon: <Clock size={16} /> },
 *     { id: 'completed', label: 'Completed', count: 15, icon: <CheckCircle size={16} /> }
 *   ]}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 * />
 * ```
 */
export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTab,
  onTabChange,
  className,
  rightElement,
  variant = 'default',
}) => {
  return (
    <div
      className={cn(
        'flex items-center gap-4',
        'my-4 mx-auto max-w-[700px] px-4',
        rightElement ? 'justify-between' : 'justify-center',
        className
      )}
    >
      <div
        className={cn(
          'flex gap-0',
          'border-b border-[var(--border)]',
          'bg-[var(--surface-subtle)]',
          'rounded-t-xl overflow-hidden',
          'w-full',
          rightElement ? 'flex-1 max-w-[600px]' : 'max-w-[600px] mx-auto',
          variant === 'full-width' && 'max-w-none mx-6',
          variant === 'compact' && 'p-0'
        )}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5',
              'px-4 py-3',
              'bg-transparent border-none',
              'border-b-2 border-transparent',
              'text-[var(--muted-foreground)] text-sm font-medium',
              'cursor-pointer transition-all duration-200',
              'font-[inherit] min-h-[44px] relative',
              'hover:text-[var(--foreground)] hover:bg-[var(--muted)]',
              'active:scale-[0.98] active:transition-[100ms]',
              'motion-reduce:transition-none',
              activeTab === tab.id && [
                'text-[var(--primary)]',
                'border-b-[var(--primary)]',
                'bg-[var(--card)]',
              ],
              // Mobile compact
              'max-[480px]:px-2.5 max-[480px]:py-2.5 max-[480px]:text-[0.8125rem] max-[480px]:gap-1',
              rightElement && 'max-[480px]:px-2',
              // Desktop wider spacing
              'min-[640px]:px-5 min-[640px]:py-3.5',
              // Compact variant
              variant === 'compact' && 'px-3.5 py-2.5 text-[0.8125rem] min-h-[40px]'
            )}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.icon && (
              <span
                className={cn(
                  'inline-flex items-center justify-center flex-shrink-0 w-4 h-4',
                  'max-[480px]:hidden'
                )}
              >
                {tab.icon}
              </span>
            )}
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {tab.label}
            </span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  'inline-flex items-center justify-center',
                  'px-1.5 py-0.5 rounded-xl',
                  'text-[0.6875rem] font-bold min-w-[1.25rem] h-[1.125rem] leading-none',
                  'bg-black/10 dark:bg-white/15',
                  activeTab === tab.id && 'bg-[var(--primary)] text-[var(--primary-foreground)]',
                  // Mobile compact
                  'max-[480px]:text-[0.625rem] max-[480px]:min-w-4 max-[480px]:h-4 max-[480px]:px-1'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
      {rightElement && (
        <div className="flex-shrink-0">{rightElement}</div>
      )}
    </div>
  );
};
