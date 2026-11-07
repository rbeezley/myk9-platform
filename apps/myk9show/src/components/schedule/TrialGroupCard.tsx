import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

/**
 * The collapsible trial card shared by the show desk schedule (MYK9-955) and
 * the ringside "Your ring" list (MYK9-1739): a bordered card whose header is
 * `chevron + trial label + summary line`, with optional leading and trailing
 * controls, over a column of rows. Callers own the open state and the rows.
 */
export function TrialGroupCard({
  open,
  onOpenChange,
  label,
  summary,
  triggerId,
  leading,
  actions,
  children,
  'data-testid': testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  summary: ReactNode;
  triggerId?: string | undefined;
  /** Before the trigger, e.g. a select-all checkbox (only worth showing while open). */
  leading?: ReactNode;
  /** After the trigger, the trial's menu. */
  actions?: ReactNode;
  children: ReactNode;
  'data-testid'?: string | undefined;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} data-testid={testId}>
      {/* overflow-clip, not -hidden: hidden makes this a scroll container and the focused
          class's pinned header (inline when stacked) would pin to it instead of the page. */}
      <div className="overflow-clip rounded-xl border bg-card text-card-foreground shadow-sm">
        {/* One row at every width: the trial menu stays in the top-right corner (MYK9-1727). */}
        <div className="flex items-start border-b">
          {leading}
          <CollapsibleTrigger
            id={triggerId}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
            className="min-w-0 flex-1 flex-nowrap gap-x-3 px-4 py-3 text-left hover:no-underline"
          >
            {/* Wrapped: the shared trigger rotates a direct-child svg 180deg when open. */}
            <span aria-hidden="true" className="shrink-0">
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  !open && '-rotate-90'
                )}
              />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{label}</div>
              <div className="text-xs font-normal text-muted-foreground">{summary}</div>
            </div>
          </CollapsibleTrigger>
          {actions && <div className="flex shrink-0 items-center px-1 pt-1.5">{actions}</div>}
        </div>
        {/* Clip, not hidden, for the same reason as the card above. */}
        <CollapsibleContent className="overflow-clip [&>div]:p-0">
          <div className="flex flex-col gap-2 p-3">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
