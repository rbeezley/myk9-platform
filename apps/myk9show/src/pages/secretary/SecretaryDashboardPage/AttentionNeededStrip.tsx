import { Link } from 'react-router-dom';
import { AlertCircle, Info } from 'lucide-react';
import type { AttentionItem } from '@/hooks/useMyShows';

interface AttentionNeededStripProps {
  items: AttentionItem[];
}

export function AttentionNeededStrip({ items }: AttentionNeededStripProps) {
  if (items.length === 0) return null;

  return (
    <div className="mx-5 mb-4 rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/40">
        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-widest text-foreground">
          Needs attention
        </span>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {items.map(item => (
          <Link
            key={`${item.showId}-${item.text}`}
            to={item.href}
            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
          >
            {item.kind === 'urgent' ? (
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            ) : (
              <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-medium ${item.kind === 'urgent' ? 'text-destructive' : 'text-foreground'}`}
              >
                {item.text}
              </p>
              <p className="text-xs text-muted-foreground truncate">{item.showName}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
