import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AppleTabItem {
  id: string;
  label: string;
  count?: number;
  description?: string;
  disabled?: boolean;
  content: React.ReactNode;
}

interface AppleTabsProps {
  tabs: AppleTabItem[];
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  isTabSwitching?: boolean;
}

/**
 * Apple-styled tabs component with beautiful gradient backgrounds and smooth transitions
 * Based on the styling from Browse Shows page
 */
export const AppleTabs: React.FC<AppleTabsProps> = ({
  tabs,
  value,
  onValueChange,
  className,
  isTabSwitching = false
}) => {
  return (
    <Tabs 
      value={value} 
      onValueChange={onValueChange} 
      className={cn("space-y-6", className)}
    >
      <div className="overflow-x-auto">
        <TabsList 
          className="grid w-full bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 h-auto min-w-max" 
          style={{gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`}}
        >
          {tabs.map((tab) => (
            <TabsTrigger 
              key={tab.id}
              value={tab.id}
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300 px-4 py-2 text-sm font-medium whitespace-nowrap"
              title={tab.description}
              disabled={tab.disabled || isTabSwitching}
            >
              <span className="flex items-center gap-2">
                {tab.label}
                {typeof tab.count !== 'undefined' && (
                  <Badge 
                    variant={value === tab.id ? 'default' : 'secondary'} 
                    className="text-xs px-1.5 py-0.5 min-w-[20px] justify-center"
                  >
                    {tab.count}
                  </Badge>
                )}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
};

export default AppleTabs;