import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Mail } from 'lucide-react';
import { PersonAvatar } from '@/components/common/PersonAvatar';
import { useResolvePerson, type ResolvedPerson } from '@/hooks/useResolvePerson';
import { getUserById } from '@/services/database/queries/userQueries';
import { mapDatabaseToUser } from '@/services/mappers/userMappers';

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
      {person.email && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <a
            href={`mailto:${person.email}`}
            className="flex items-center gap-1.5 hover:text-foreground"
          >
            <Mail className="h-3 w-3" />
            {person.email}
          </a>
        </div>
      )}
    </div>
  );
}

/** Resolve a person by ID — tries Zustand store first, falls back to DB query. */
function useResolveOfficial(personId: string | null | undefined): ResolvedPerson | null {
  const resolvePerson = useResolvePerson();
  const storePerson = resolvePerson(personId);
  const isUnresolved = !!personId && storePerson?.name === personId;

  const { data: fetchedPerson } = useQuery({
    queryKey: ['person', personId],
    queryFn: async () => {
      const { data } = await getUserById(personId!);
      if (!data) return null;
      const user = mapDatabaseToUser(data);
      return {
        name: `${user.firstName} ${user.lastName}`,
        profileImage: user.profileImage,
        email: user.email,
        phone: user.phone,
      } as ResolvedPerson;
    },
    enabled: isUnresolved,
    staleTime: 30 * 60 * 1000, // 30 min — people don't change often
  });

  if (!personId) return null;
  return isUnresolved && fetchedPerson ? fetchedPerson : storePerson;
}

interface ShowOfficialsProps {
  chairmanId?: string | null;
  secretaryId?: string | null;
  chiefStewardId?: string | null;
}

export function ShowOfficials({ chairmanId, secretaryId, chiefStewardId }: ShowOfficialsProps) {
  const chairman = useResolveOfficial(chairmanId);
  const secretary = useResolveOfficial(secretaryId);
  const chiefSteward = useResolveOfficial(chiefStewardId);

  if (!chairman && !secretary && !chiefSteward) return null;

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
        {chiefSteward && <OfficialCard person={chiefSteward} role="Chief Steward" />}
      </div>
    </Card>
  );
}
