import React, { useEffect, useRef } from 'react';
import { Lock } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface PrimaryTabDef {
  id: string;
  label: string;
  icon?: LucideIcon | React.ReactElement;
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
  /** Classes for the strip's wrapper, e.g. to pin it under a sticky header. */
  stripClassName?: string | undefined;
  /**
   * Render only the panel when there is a single tab: a one-item tab strip is
   * a label with nothing to switch to. Off by default so other pages keep
   * their strip.
   */
  hideWhenSingle?: boolean;
  /** Accessible name for the tab strip; set it when a page holds more than one strip. */
  ariaLabel?: string;
  /**
   * Fit every tab on screen with nothing to swipe (MYK9-1729, the MYK9-1717 principle). Below
   * `md` each tab is an equal column with its icon and count on top and its label under them,
   * wrapping to two lines; from `md` the tabs sit inline at their content width. Off by default,
   * so other pages keep the scrolling strip.
   */
  fit?: boolean;
}

export function PrimaryTabs({
  tabs,
  value,
  onValueChange,
  children,
  resetKey,
  className,
  stripClassName,
  hideWhenSingle = false,
  ariaLabel,
  fit = false,
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
      <div
        className={cn('relative max-w-full', stripClassName)}
        hidden={hideWhenSingle && tabs.length <= 1}
      >
        {/* scroll-shadow-x — the same content-aware overflow cue used by the
            exhibitor DogStrip rail (only shows a fade on an edge while there
            is more to scroll toward, and disappears once that edge is
            reached). Replaces a static right-edge gradient that stayed
            visible even when the strip fit entirely on screen, and pairs
            with min-width-per-trigger below so labels scroll instead of
            crushing illegibly at phone widths (390px). */}
        <TabsList
          {...(ariaLabel !== undefined ? { 'aria-label': ariaLabel } : {})}
          className={cn(
            'flex w-full max-w-full border-b border-border bg-transparent p-0 gap-0',
            !fit && 'overflow-x-auto hide-scrollbar scroll-shadow-x'
          )}
        >
          {tabs.map(tab => {
            const icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  'inline-flex min-h-[48px] items-center justify-center gap-1.5 text-xs font-medium',
                  fit
                    ? 'min-w-0 flex-1 flex-wrap content-center gap-x-0 gap-y-0 px-0.5 py-1.5 md:min-w-max md:flex-none md:flex-nowrap md:gap-1.5 md:px-2 md:py-2 md:text-sm lg:px-4'
                    : 'min-w-[92px] flex-none px-2 py-2 sm:min-w-max sm:px-4 sm:text-sm',
                  'text-muted-foreground border-b-2 border-transparent rounded-none bg-transparent',
                  'aria-selected:text-primary aria-selected:border-primary',
                  'hover:text-foreground transition-colors',
                  fit ? 'md:whitespace-nowrap' : 'whitespace-nowrap'
                )}
              >
                {icon &&
                  (React.isValidElement(icon)
                    ? icon
                    : React.createElement(icon as LucideIcon, { className: 'h-4 w-4' }))}
                {/* In fit mode below `md` the label wraps onto its own line under the icon and
                    counts (`order-last w-full`); the DOM order, and so the accessible name, stays
                    label first. */}
                <span
                  className={
                    fit
                      ? 'order-last w-full whitespace-normal [overflow-wrap:anywhere] text-center leading-tight md:order-none md:w-auto md:whitespace-nowrap md:truncate'
                      : 'truncate'
                  }
                >
                  {tab.label}
                </span>
                {tab.locked && (
                  <Lock className="ml-0.5 h-3 w-3 opacity-40" aria-label="Premium feature" />
                )}
                {tab.count !== undefined && (
                  <Badge
                    variant="secondary"
                    className="ml-1 px-1.5 py-0 text-xs min-w-[20px] justify-center"
                  >
                    {tab.count}
                  </Badge>
                )}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-bold text-white">
                    {tab.badge}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
}

// Re-export TabsContent for convenience
export { TabsContent, TabsContent as PrimaryTabsContent } from '@/components/ui/tabs';
