import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Mail } from 'lucide-react';
import { extractPersonName } from '@/components/users/UserDetails/userDetailsTypes';
import { BrowseCard, BrowseCardAvatar, BrowseCardDetail } from '@/components/common/BrowseCard';
import type { User } from '@/types/user-types';

interface PeopleGridViewProps {
  people: User[];
}

function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export const PeopleGridView: React.FC<PeopleGridViewProps> = ({ people }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      {people.map(person => {
        const { fullName } = extractPersonName(person);
        const personRecord = person as unknown as Record<string, unknown>;
        const profileImage =
          person.profileImage ||
          (personRecord.profile_image_url as string) ||
          (personRecord.profile_image as string);

        return (
          <BrowseCard
            key={person.id}
            href={`/users/${person.id}`}
            actionLabel="View Person"
            name={fullName}
            avatar={
              <BrowseCardAvatar
                src={profileImage}
                fallback={(fullName || '?').charAt(0).toUpperCase()}
                alt={fullName}
              />
            }
            badges={
              <>
                {person.roles &&
                  person.roles.slice(0, 2).map(role => (
                    <Badge
                      key={role}
                      variant="secondary"
                      className="text-xs bg-primary/10 text-primary"
                    >
                      {formatRole(role)}
                    </Badge>
                  ))}
                {person.roles && person.roles.length > 2 && (
                  <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                    +{person.roles.length - 2}
                  </Badge>
                )}
              </>
            }
          >
            {person.email && (
              <div className="mt-3">
                <BrowseCardDetail icon={<Mail className="h-3.5 w-3.5 shrink-0" />}>
                  {person.email}
                </BrowseCardDetail>
              </div>
            )}
          </BrowseCard>
        );
      })}
    </div>
  );
};

export default PeopleGridView;
