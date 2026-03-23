import { useEffect, useRef } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface SubTabDef {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface SubTabsProps {
  tabs: SubTabDef[];
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  /** When this key changes, the active tab resets to the first tab. */
  resetKey?: string;
  className?: string;
}

export function SubTabs({
  tabs,
  value,
  onValueChange,
  children,
  resetKey,
  className,
}: SubTabsProps) {
  const prevResetKey = useRef(resetKey);

  useEffect(() => {
    if (prevResetKey.current !== resetKey && tabs.length > 0) {
      onValueChange(tabs[0].id);
    }
    prevResetKey.current = resetKey;
  }, [resetKey, tabs, onValueChange]);

  return (
    <Tabs
      value={value}
      onValueChange={onValueChange}
      {...(className !== undefined ? { className } : {})}
    >
      <TabsList className="bg-muted/50 rounded-lg p-1 gap-0.5">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
                'text-muted-foreground bg-transparent',
                'aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-sm',
                'hover:text-foreground transition-colors whitespace-nowrap'
              )}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {tab.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {children}
    </Tabs>
  );
}

// Re-export TabsContent as SubTabsContent for naming clarity
export { TabsContent as SubTabsContent } from '@/components/ui/tabs';
