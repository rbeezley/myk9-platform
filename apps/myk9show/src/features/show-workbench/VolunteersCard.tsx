import { ArrowRight, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface VolunteersCardProps {
  // When provided, the card links with ?showId=... so the standalone
  // scheduling page lands on the secretary's current show context
  // instead of whatever the sidebar's last selectedShowId happens to be.
  // Omitted from non-workbench callers.
  showId?: string | undefined;
}

// INTENT: Phase B3 — entry-point card for volunteer scheduling. Links to
// `/secretary/volunteers`, preserving the active show context as a query
// param when rendered inside a show's workbench so the secretary cannot
// land on the wrong show's volunteers via a stale sidebar selection.
export function VolunteersCard({ showId }: VolunteersCardProps = {}) {
  const href = showId
    ? `/secretary/volunteers?showId=${encodeURIComponent(showId)}`
    : '/secretary/volunteers';
  return (
    <section className="rounded-md border bg-card p-4" aria-labelledby="volunteers-card-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="volunteers-card-title" className="text-base font-semibold">
            Volunteers
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Schedule helpers for the gate, scoring table, ribbons, and stewarding.
          </p>
        </div>
        <Users className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="mt-3">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link to={href}>
            Open volunteer scheduling
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
