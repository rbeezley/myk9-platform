import { Link } from 'react-router-dom';

export interface RelatedContextLinkItem {
  key: string;
  label: string;
  href: string;
}

interface RelatedContextLinksProps {
  items: RelatedContextLinkItem[];
  className?: string;
}

/**
 * Compact, single-line "Related:" links for an existing detail surface.
 *
 * Presentational only — callers build `items` from already-loaded
 * props/rows (no fetching here). Renders nothing when `items` is empty, per
 * the "Related context links stay inside existing surfaces" spec: a link is
 * shown only when its target ID and authorized route are already known.
 */
export function RelatedContextLinks({ items, className }: RelatedContextLinksProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Related context"
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground ${className ?? ''}`}
    >
      <span>Related:</span>
      {items.map((item, index) => (
        <span key={item.key} className="flex items-center gap-1.5">
          {index > 0 && <span aria-hidden="true">&middot;</span>}
          <Link to={item.href} className="underline-offset-2 hover:text-foreground hover:underline">
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
