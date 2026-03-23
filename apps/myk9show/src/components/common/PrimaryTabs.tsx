import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface PrimaryTabDef {
  id: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

interface PrimaryTabsProps {
  tabs: PrimaryTabDef[];
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function PrimaryTabs({ tabs, value, onValueChange, children, className }: PrimaryTabsProps) {
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
              {tab.count !== undefined && (
                <Badge
                  variant="secondary"
                  className="ml-1 px-1.5 py-0 text-[10px] min-w-[20px] justify-center"
                >
                  {tab.count}
                </Badge>
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
export { TabsContent } from '@/components/ui/tabs';
