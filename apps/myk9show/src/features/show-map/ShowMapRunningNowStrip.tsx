import { RadioTower } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ShowMapRunningNowItem } from './showMapRunningNow';

interface ShowMapRunningNowStripProps {
  items: ShowMapRunningNowItem[];
  onSelect: (nodeId: string) => void;
}

export function ShowMapRunningNowStrip({ items, onSelect }: ShowMapRunningNowStripProps) {
  if (items.length === 0) return null;

  return (
    <section className="mb-3 rounded-md border bg-muted/15" aria-label="Running now">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
        <RadioTower className="h-4 w-4" />
        Running Now
      </div>
      <div className="flex gap-2 overflow-x-auto p-3">
        {items.map(item => (
          <Button
            key={item.nodeId}
            type="button"
            variant="outline"
            className="h-auto min-w-[220px] justify-start p-3 text-left"
            onClick={() => onSelect(item.nodeId)}
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
        ))}
      </div>
    </section>
  );
}
