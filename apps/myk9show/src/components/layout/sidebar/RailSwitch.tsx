import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { NavItem } from './types';

interface RailSwitchProps {
  /** The other managed shows, soonest first. */
  items: NavItem[];
  isActive: (href: string) => boolean;
}

/**
 * "Switch" under the current-show rail item, shown only when the viewer manages more than one
 * show. Picking one opens its Overview and remembers it as current until it ends.
 */
export function RailSwitch({ items, isActive }: RailSwitchProps) {
  const [open, setOpen] = useState(false);
  const headingId = useId();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Switch show"
          className="mx-auto -mt-1 flex min-h-11 w-full items-center justify-center rounded-lg px-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Switch
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        aria-labelledby={headingId}
        className="max-h-[var(--available-height)] w-72 overflow-y-auto p-2"
      >
        <p id={headingId} className="px-2 pb-1 pt-1 text-sm font-semibold text-foreground">
          Switch show
        </p>
        <ul className="space-y-0.5">
          {items.map(item => (
            <li key={item.href}>
              <Link
                to={item.href}
                onClick={() => {
                  item.onSelect?.();
                  setOpen(false);
                }}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center rounded-md px-2 py-1.5 text-sm',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  isActive(item.href)
                    ? 'bg-primary/10 font-semibold text-foreground'
                    : 'text-foreground hover:bg-muted/50'
                )}
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
