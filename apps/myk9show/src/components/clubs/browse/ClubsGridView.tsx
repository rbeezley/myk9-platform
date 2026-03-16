import React from 'react';
import { Badge } from '@/components/ui/badge';
import { MapPin, Users, Calendar } from 'lucide-react';
import { getClubInitials } from '@/components/clubs/ClubDetails/utils';
import { CLUB_TYPES } from '@/types/club-types';
import type { Club } from '@/types/club-types';
import { BrowseCard, BrowseCardAvatar, BrowseCardDetail } from '@/components/common/BrowseCard';

interface ClubsGridViewProps {
  clubs: Club[];
  clubShowCounts: Map<string, number>;
}

function getClubTypeLabel(clubType: string | undefined): string | null {
  if (!clubType) return null;
  return CLUB_TYPES.find(t => t.value === clubType)?.label || clubType;
}

export const ClubsGridView: React.FC<ClubsGridViewProps> = ({ clubs, clubShowCounts }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      {clubs.map(club => {
        const upcomingCount = clubShowCounts.get(club.id) || 0;
        const memberCount = club.memberIds?.length || 0;
        const typeLabel = getClubTypeLabel(club.clubType);
        const location = [club.address?.city, club.address?.state].filter(Boolean).join(', ');

        return (
          <BrowseCard
            key={club.id}
            href={`/clubs/${club.id}`}
            actionLabel="View Club"
            name={club.name}
            avatar={
              <BrowseCardAvatar
                src={club.logo}
                fallback={getClubInitials(club.name)}
                alt={club.name}
                shape="square"
              />
            }
            badges={
              typeLabel ? (
                <Badge variant="secondary" className="text-xs">
                  {typeLabel}
                </Badge>
              ) : undefined
            }
          >
            {club.description && (
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{club.description}</p>
            )}

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {location && (
                <BrowseCardDetail icon={<MapPin className="h-3.5 w-3.5 shrink-0" />}>
                  {location}
                </BrowseCardDetail>
              )}
              <BrowseCardDetail icon={<Users className="h-3.5 w-3.5 shrink-0" />}>
                {memberCount} member{memberCount !== 1 ? 's' : ''}
              </BrowseCardDetail>
              <BrowseCardDetail icon={<Calendar className="h-3.5 w-3.5 shrink-0" />}>
                {upcomingCount} upcoming show{upcomingCount !== 1 ? 's' : ''}
              </BrowseCardDetail>
            </div>
          </BrowseCard>
        );
      })}
    </div>
  );
};

export default ClubsGridView;
