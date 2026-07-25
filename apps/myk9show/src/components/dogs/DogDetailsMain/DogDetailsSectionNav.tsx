import React from 'react';
import { Lock } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useElementWidth } from '@/hooks/useElementWidth';
import { cn } from '@/lib/utils';
import type { DogDetailsSection, DogDetailsView } from './dogDetailsSections';

export interface TopLevelSectionDef {
  id: DogDetailsSection;
  label: string;
}

export interface SecondaryViewDef {
  id: DogDetailsView;
  label: string;
  locked?: boolean;
}

const TOP_LEVEL_SECTIONS: TopLevelSectionDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'career', label: 'Career' },
  { id: 'records', label: 'Records' },
];

interface TopLevelSectionNavProps {
  value: DogDetailsSection;
  onValueChange: (section: DogDetailsSection) => void;
  className?: string;
}

/**
 * Overview / Career / Records — always three short labels, so a fitted
 * segmented control reads cleanly at every audited viewport without needing
 * a narrow-container fallback.
 */
export const TopLevelSectionNav: React.FC<TopLevelSectionNavProps> = ({
  value,
  onValueChange,
  className,
}) => (
  <Tabs value={value} onValueChange={v => onValueChange(v as DogDetailsSection)}>
    <TabsList
      aria-label="Dog details section"
      className={cn(
        'flex w-full max-w-full border-b border-border bg-transparent p-0 gap-0',
        className
      )}
    >
      {TOP_LEVEL_SECTIONS.map(section => (
        <TabsTrigger
          key={section.id}
          value={section.id}
          className={cn(
            'inline-flex min-h-[48px] min-w-[92px] flex-1 items-center justify-center gap-1.5 px-2 py-2 text-sm font-medium sm:flex-none sm:min-w-max sm:px-6',
            'text-muted-foreground border-b-2 border-transparent rounded-none bg-transparent',
            'aria-selected:text-primary aria-selected:border-primary',
            'hover:text-foreground transition-colors whitespace-nowrap'
          )}
        >
          {section.label}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);

interface SecondaryViewNavProps {
  label: string;
  views: SecondaryViewDef[];
  value: DogDetailsView;
  onValueChange: (view: DogDetailsView) => void;
  /** Below this measured content-container width, switch to a select. */
  narrowBreakpoint?: number;
}

/**
 * Container-aware secondary navigation for Career/Records. Renders a single
 * node that is reshaped by measured container width (via useElementWidth),
 * not viewport media queries and not two parallel CSS-hidden copies: a
 * fitted segmented control when there is room, an accessible <select> when
 * the Dog Details content container is narrow (e.g. two-column desktop
 * layouts, phone widths).
 */
export const SecondaryViewNav: React.FC<SecondaryViewNavProps> = ({
  label,
  views,
  value,
  onValueChange,
  narrowBreakpoint = 480,
}) => {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  // Unmeasured on first render — default to the accessible select so nothing
  // ever renders unclipped-but-wrong before the observer reports a width.
  const isNarrow = width === null || width < narrowBreakpoint;

  return (
    <div ref={ref} className="w-full max-w-full">
      {isNarrow ? (
        <Select value={value} onValueChange={v => onValueChange(v as DogDetailsView)}>
          <SelectTrigger aria-label={label} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {views.map(view => (
              <SelectItem key={view.id} value={view.id}>
                <span className="inline-flex items-center gap-1.5">
                  {view.label}
                  {view.locked && <Lock className="h-3 w-3 opacity-50" aria-label="Premium" />}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Tabs value={value} onValueChange={v => onValueChange(v as DogDetailsView)}>
          <TabsList
            aria-label={label}
            className="flex w-full max-w-full overflow-x-auto hide-scrollbar border-b border-border bg-transparent p-0 gap-1"
          >
            {views.map(view => (
              <TabsTrigger
                key={view.id}
                value={view.id}
                className={cn(
                  'inline-flex min-h-[44px] flex-none items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium',
                  'text-muted-foreground border-b-2 border-transparent',
                  'aria-selected:text-primary aria-selected:border-primary',
                  'hover:text-foreground transition-colors whitespace-nowrap'
                )}
              >
                {view.label}
                {view.locked && (
                  <Lock className="ml-0.5 h-3 w-3 opacity-40" aria-label="Premium feature" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
    </div>
  );
};
