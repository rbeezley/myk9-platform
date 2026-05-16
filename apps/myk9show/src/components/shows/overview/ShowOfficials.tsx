import { Card } from '@/components/ui/card';
import { Mail } from 'lucide-react';
import { PersonAvatar } from '@/components/common/PersonAvatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useShowOfficials, type ShowOfficial } from '@/hooks/queries/useShowOfficials';

// Reserve vertical space while officials load so the rest of the page
// (Judges, Share, More-from-club) doesn't get pushed down. ~200px matches
// the typical rendered height of one chairman + one secretary card.
// INTENT: prevent CLS on /shows/:id Overview tab — see PR "perf(shows): reserve
// layout space for deferred panels (CLS)".
export const SHOW_OFFICIALS_RESERVED_MIN_HEIGHT_PX = 200;

interface OfficialCardProps {
  official: ShowOfficial;
  role: string;
}

function OfficialCard({ official, role }: OfficialCardProps) {
  const name = `${official.firstName} ${official.lastName}`.trim() || 'Unknown';
  return (
    <div className="flex flex-col items-center text-center gap-2 p-4">
      <PersonAvatar name={name} size="lg" />
      <div>
        <div className="font-semibold text-foreground">{name}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{role}</div>
      </div>
      {official.email && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <a
            href={`mailto:${official.email}`}
            className="flex items-center gap-1.5 hover:text-foreground"
          >
            <Mail className="h-3 w-3" />
            {official.email}
          </a>
        </div>
      )}
    </div>
  );
}

interface ShowOfficialsProps {
  showId: string;
}

export function ShowOfficials({ showId }: ShowOfficialsProps) {
  const { data: officials, isLoading } = useShowOfficials(showId);

  // Reserve space during the initial fetch so deferred content doesn't push
  // the rest of the sidebar down once data arrives.
  if (isLoading) {
    return (
      <Card
        data-testid="show-officials-skeleton"
        style={{ minHeight: `${SHOW_OFFICIALS_RESERVED_MIN_HEIGHT_PX}px` }}
      >
        <div className="p-4 border-b border-border/30">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Show Officials
          </h3>
        </div>
        <div className="p-4 space-y-3" aria-busy="true">
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-12 w-12 rounded-full" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-20" />
          </div>
          <div className="flex flex-col items-center gap-2 pt-3 border-t border-border/30">
            <Skeleton className="h-12 w-12 rounded-full" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
      </Card>
    );
  }

  if (!officials) return null;

  const hasAny =
    officials.secretaries.length > 0 ||
    officials.chairmen.length > 0 ||
    officials.stewards.length > 0;

  if (!hasAny) return null;

  return (
    <Card>
      <div className="p-4 border-b border-border/30">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Show Officials
        </h3>
      </div>
      <div className="divide-y divide-border/30">
        {officials.chairmen.map(o => (
          <OfficialCard key={o.personId} official={o} role="Chairman" />
        ))}
        {officials.secretaries.map(o => (
          <OfficialCard key={o.personId} official={o} role="Secretary" />
        ))}
        {officials.stewards.map(o => (
          <OfficialCard key={o.personId} official={o} role="Steward" />
        ))}
      </div>
    </Card>
  );
}
