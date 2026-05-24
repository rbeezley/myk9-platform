import { ArrowRight, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

// INTENT: Phase B3 — entry-point card for volunteer scheduling. Links to the
// standalone scheduling page at `/secretary/volunteers`.
export function VolunteersCard() {
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
          <Link to="/secretary/volunteers">
            Open volunteer scheduling
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
