import { MapPin, RadioTower } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ShowMapRunningNowItem } from './showMapRunningNow';

interface ShowMapRunningNowStripProps {
  items: ShowMapRunningNowItem[];
  /** Primary click — open the class page directly (MYK9-64 F4). */
  onOpen: (href: string) => void;
  /** Secondary action — expand + scroll the Show Map tree to the class row. */
  onLocate: (nodeId: string) => void;
}

export function ShowMapRunningNowStrip({ items, onOpen, onLocate }: ShowMapRunningNowStripProps) {
  if (items.length === 0) return null;

  return (
    <section className="mb-3 rounded-md border bg-muted/15" aria-label="Running now">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
        <RadioTower className="h-4 w-4" />
        Running Now
      </div>
      <div className="flex gap-2 overflow-x-auto p-3">
        {items.map(item => (
          <div
            key={item.nodeId}
            className="flex min-w-[220px] flex-col rounded-md border bg-card"
            data-running-now-card={item.nodeId}
          >
            <Button
              type="button"
              variant="ghost"
              className="h-auto flex-1 justify-start rounded-b-none p-3 text-left"
              // A card without a class href (synthetic/degraded node) falls back
              // to locating the row in the tree rather than going nowhere.
              onClick={() => (item.href ? onOpen(item.href) : onLocate(item.nodeId))}
            >
              <span className="min-w-0 space-y-1">
                <span className="block text-xs font-semibold uppercase text-muted-foreground">
                  {item.ringLabel}
                </span>
                <span className="block truncate text-sm font-semibold text-foreground">
                  {item.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[item.judgeName, item.startTime].filter(Boolean).join(' · ') || 'In progress'}
                </span>
                {typeof item.percentScored === 'number' && (
                  <span className="block text-xs text-muted-foreground">
                    {item.percentScored}% scored
                  </span>
                )}
              </span>
            </Button>
            {item.href && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-[44px] justify-start rounded-t-none border-t px-3 text-xs text-muted-foreground"
                onClick={() => onLocate(item.nodeId)}
                data-testid={`locate-in-show-map-${item.nodeId}`}
              >
                <MapPin className="h-3.5 w-3.5" />
                Locate in Show Map
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
