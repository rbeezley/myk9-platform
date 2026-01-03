/**
 * PremiumTabBar Component
 * 
 * Apple-inspired tab navigation with gradient backgrounds, rounded pills,
 * and sophisticated active states. Automatically follows design system.
 */

/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Crown, LucideIcon } from 'lucide-react';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: LucideIcon;
  disabled?: boolean;
  isPremium?: boolean;
  content?: React.ReactNode;
}

export interface PremiumTabBarProps {
  tabs: TabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  variant?: 'standard' | 'withBadges' | 'premium' | 'compact';
}

export function PremiumTabBar({
  tabs,
  defaultValue,
  value,
  onValueChange,
  className,
  variant = 'standard'
}: PremiumTabBarProps) {
  const tabCount = tabs.length;
  
  // Generate grid columns dynamically
  const gridColumns = tabCount <= 6 
    ? `grid-cols-${tabCount}` 
    : 'grid-flow-col auto-cols-fr';

  const containerClassName = cn(
    "grid w-full bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1",
    tabCount <= 6 && gridColumns,
    tabCount > 6 && "overflow-x-auto min-w-max",
    className
  );

  const triggerClassName = "data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300 data-[state=disabled]:opacity-50";

  return (
    <Tabs 
      defaultValue={defaultValue || tabs[0]?.id} 
      value={value} 
      onValueChange={onValueChange}
      className="w-full"
    >
      <TabsList 
        className={containerClassName}
        style={tabCount > 6 ? { gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` } : undefined}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            disabled={tab.disabled}
            className={cn(
              triggerClassName,
              variant === 'compact' && "px-2 py-1.5 text-xs"
            )}
          >
            <span className="flex items-center gap-2">
              {tab.isPremium && <Crown className="h-4 w-4 text-premium-gold" />}
              {tab.icon && <tab.icon className="h-4 w-4" />}
              <span>{tab.label}</span>
              {(variant === 'withBadges' || variant === 'premium') && typeof tab.count !== 'undefined' && (
                <Badge 
                  variant="secondary" 
                  className="text-xs px-1.5 py-0.5 min-w-[20px] justify-center"
                >
                  {tab.count}
                </Badge>
              )}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((tab) => (
        tab.content && (
          <TabsContent key={`content-${tab.id}`} value={tab.id} className="mt-6">
            {tab.content}
          </TabsContent>
        )
      ))}
    </Tabs>
  );
}

// Convenience hooks for common patterns
export function usePremiumTabs(tabs: Omit<TabItem, 'content'>[]) {
  return tabs.map(tab => ({
    ...tab,
    content: <div>Content for {tab.label}</div> // Placeholder
  }));
}

// Common tab configurations
export const createDashboardTabs = (counts: { [key: string]: number }) => [
  { id: 'overview', label: 'Overview', count: counts.overview },
  { id: 'analytics', label: 'Analytics', count: counts.analytics },
  { id: 'settings', label: 'Settings', count: counts.settings },
];

export const createEntityTabs = (entityName: string, counts: { [key: string]: number }) => [
  { id: 'details', label: `${entityName} Details` },
  { id: 'history', label: 'History', count: counts.history },
  { id: 'settings', label: 'Settings' },
];

export const createShowTabs = (counts: { [key: string]: number }) => [
  { id: 'all', label: 'All Shows', count: counts.all },
  { id: 'past', label: 'Past Shows', count: counts.past },
  { id: 'entries', label: 'My Entries', count: counts.entries },
  { id: 'managing', label: 'Managing', count: counts.managing },
];