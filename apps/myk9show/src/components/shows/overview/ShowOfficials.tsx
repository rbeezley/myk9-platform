import { Card } from '@/components/ui/card';
import { Mail, Phone } from 'lucide-react';
import { PersonAvatar } from '@/components/common/PersonAvatar';
import { useResolvePerson, type ResolvedPerson } from '@/hooks/useResolvePerson';

interface OfficialCardProps {
  person: ResolvedPerson;
  role: string;
}

function OfficialCard({ person, role }: OfficialCardProps) {
  return (
    <div className="flex flex-col items-center text-center gap-2 p-4">
      <PersonAvatar name={person.name} avatarUrl={person.profileImage} size="lg" />
      <div>
        <div className="font-semibold text-foreground">{person.name}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{role}</div>
      </div>
      {(person.email || person.phone) && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {person.email && (
            <a
              href={`mailto:${person.email}`}
              className="flex items-center gap-1.5 hover:text-foreground"
            >
              <Mail className="h-3 w-3" />
              {person.email}
            </a>
          )}
          {person.phone && (
            <a
              href={`tel:${person.phone}`}
              className="flex items-center gap-1.5 hover:text-foreground"
            >
              <Phone className="h-3 w-3" />
              {person.phone}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

interface ShowOfficialsProps {
  chairmanId?: string | null;
  secretaryId?: string | null;
}

export function ShowOfficials({ chairmanId, secretaryId }: ShowOfficialsProps) {
  const resolvePerson = useResolvePerson();
  const chairman = resolvePerson(chairmanId);
  const secretary = resolvePerson(secretaryId);

  if (!chairman && !secretary) return null;

  return (
    <Card>
      <div className="p-4 border-b border-border/30">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Show Officials
        </h3>
      </div>
      <div className="divide-y divide-border/30">
        {chairman && <OfficialCard person={chairman} role="Chairman" />}
        {secretary && <OfficialCard person={secretary} role="Secretary" />}
      </div>
    </Card>
  );
}
