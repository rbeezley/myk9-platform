import { useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface PrimaryTabDef {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Neutral count badge shown after the label. */
  count?: number;
  /** Alert-style numeric badge (amber circle) — for unread/attention counts. */
  badge?: number;
  /** Shows a small lock icon after the label — for premium-gated tabs. */
  locked?: boolean;
}

interface PrimaryTabsProps {
  tabs: PrimaryTabDef[];
  value: string;
  onValueChange: (value: string) => void;
  children?: React.ReactNode;
  /** When this key changes, the active tab resets to the first tab. */
  resetKey?: string;
  className?: string;
}

export function PrimaryTabs({
  tabs,
  value,
  onValueChange,
  children,
  resetKey,
  className,
}: PrimaryTabsProps) {
  const prevResetKey = useRef(resetKey);

  useEffect(() => {
    if (prevResetKey.current !== resetKey && tabs.length > 0) {
      onValueChange(tabs[0].id);
    }
    prevResetKey.current = resetKey;
  }, [resetKey, tabs, onValueChange]);

  // Only spread className when defined to satisfy exactOptionalPropertyTypes
  const classNameProps = className !== undefined ? { className } : {};

  return (
    <Tabs value={value} onValueChange={onValueChange} {...classNameProps}>
      <TabsList
        className={cn(
          'flex overflow-x-auto no-scrollbar border-b border-border bg-transparent p-0 gap-0'
        )}
      >
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className={cn(
                'inline-flex items-center gap-1.5 min-h-[48px] px-4 py-2 text-sm font-medium',
                'text-muted-foreground border-b-2 border-transparent rounded-none bg-transparent',
                'aria-selected:text-primary aria-selected:border-primary',
                'hover:text-foreground transition-colors whitespace-nowrap'
              )}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {tab.label}
              {tab.locked && (
                <Lock className="ml-0.5 h-3 w-3 opacity-40" aria-label="Premium feature" />
              )}
              {tab.count !== undefined && (
                <Badge
                  variant="secondary"
                  className="ml-1 px-1.5 py-0 text-[10px] min-w-[20px] justify-center"
                >
                  {tab.count}
                </Badge>
              )}
              {tab.badge != null && tab.badge > 0 && (
                <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                  {tab.badge}
                </span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {children}
    </Tabs>
  );
}

// Re-export TabsContent for convenience
export { TabsContent, TabsContent as PrimaryTabsContent } from '@/components/ui/tabs';
