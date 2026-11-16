import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import type { PremiumRequirementItem } from './premiumRequirements';

interface PremiumRequirementsNoticeProps {
  items: ReadonlyArray<PremiumRequirementItem>;
  /** The registry the premium is checked against, named in the heading. */
  registry: string | null;
}

/**
 * MYK9-2053: what the registry requires that is still empty, above the Generate & publish
 * control. It warns and never blocks: the publish button stays as it is. Nothing here when
 * nothing is missing, so a complete show shows the secretary nothing to filter past.
 */
export function PremiumRequirementsNotice({ items, registry }: PremiumRequirementsNoticeProps) {
  if (items.length === 0) return null;
  return (
    <section
      aria-label="Premium list requirements"
      className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
    >
      <p className="flex items-center gap-2 font-medium text-warning">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        Before you publish, {registry ?? 'the registry'} still needs:
      </p>
      <ul className="mt-2 space-y-1">
        {items.map(item => (
          <li key={item.key} className="flex flex-wrap items-center gap-x-2">
            <span>{item.message}</span>
            {item.href && (
              <Link
                to={item.href}
                aria-label={`Fix: ${item.message}`}
                className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Fix it
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
