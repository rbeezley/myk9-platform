import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ChevronDown, ChevronUp, Info } from 'lucide-react';
import type { AttentionItem } from '@/hooks/useMyShows';

interface AttentionNeededStripProps {
  items: AttentionItem[];
}

const STORAGE_KEY = 'myk9-secretary-dashboard-attention-open';
const AUTO_COLLAPSE_AT = 4;

function getInitialOpen(itemCount: number): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // localStorage may be unavailable in private/SSR-like environments.
  }
  return itemCount < AUTO_COLLAPSE_AT;
}

function persistOpen(open: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(open));
  } catch {
    // Preference persistence is nice-to-have; the dashboard still works.
  }
}

export function AttentionNeededStrip({ items }: AttentionNeededStripProps) {
  const contentId = useId();
  const [open, setOpen] = useState(() => getInitialOpen(items.length));

  if (items.length === 0) return null;

  const itemLabel = items.length === 1 ? 'item' : 'items';
  const toggleLabel = `${open ? 'Hide' : 'Show'} ${items.length} attention ${itemLabel}`;

  function toggleOpen() {
    setOpen(current => {
      const next = !current;
      persistOpen(next);
      return next;
    });
  }

  return (
    <div className="mx-5 mb-4 rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/40">
        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-foreground">
            Needs attention
          </span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {items.length} {itemLabel} need attention
          </p>
        </div>
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={toggleLabel}
          className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden="true">{open ? 'Hide' : 'Show'}</span>
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div id={contentId} hidden={!open} className="flex flex-col divide-y divide-border">
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
              {item.showName && (
                <p className="text-xs text-muted-foreground truncate">{item.showName}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
