import { Card } from '@/components/ui/card';
import { Mail } from 'lucide-react';
import { PersonAvatar } from '@/components/common/PersonAvatar';
import { useShowOfficials, type ShowOfficial } from '@/hooks/queries/useShowOfficials';

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
  const { data: officials } = useShowOfficials(showId);

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
          <OfficialCard key={o.personId} official={o} role="Chief Steward" />
        ))}
      </div>
    </Card>
  );
}
