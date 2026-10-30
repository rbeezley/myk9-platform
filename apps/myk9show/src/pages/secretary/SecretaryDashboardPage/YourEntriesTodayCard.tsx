import { Link } from 'react-router-dom';
import { Dog } from 'lucide-react';
import { useEntriesToday } from '@/hooks/useEntriesToday';

/**
 * The viewer's own entries in a show happening today. It only links: check-in lives on the
 * entries page, so every row goes there and nothing here changes an entry.
 */
export function YourEntriesTodayCard() {
  const { lines, showNames } = useEntriesToday();
  if (lines.length === 0) return null;

  return (
    <section aria-label="Your entries today" className="mx-5 mb-4">
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Your entries today
      </h2>
      <ul className="divide-y divide-border rounded-xl border border-dashed border-border">
        {lines.map(line => (
          <li key={line.entryId}>
            <Link
              to="/exhibitor/entries"
              className="flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Dog className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {line.dogCallName}
                  {line.classLabel ? `, ${line.classLabel}` : ''}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {showNames.get(line.showId) ?? ''}
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-primary">{line.statusLabel}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
