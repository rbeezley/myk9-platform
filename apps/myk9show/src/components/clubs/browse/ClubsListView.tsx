import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Users, Calendar, Eye } from 'lucide-react';
import { getClubInitials } from '@/components/clubs/ClubDetails/utils';
import { CLUB_TYPES } from '@/types/club-types';
import type { Club } from '@/types/club-types';

interface ClubsListViewProps {
  clubs: Club[];
  clubShowCounts: Map<string, number>;
}

/** Get human-readable label for a club type value */
function getClubTypeLabel(clubType: string | undefined): string | null {
  if (!clubType) return null;
  return CLUB_TYPES.find(t => t.value === clubType)?.label || clubType;
}

export const ClubsListView: React.FC<ClubsListViewProps> = ({ clubs, clubShowCounts }) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {clubs.map(club => {
        const upcomingCount = clubShowCounts.get(club.id) || 0;
        const memberCount = club.memberIds?.length || 0;
        const typeLabel = getClubTypeLabel(club.clubType);
        const location = [club.address?.city, club.address?.state].filter(Boolean).join(', ');

        return (
          <Card
            key={club.id}
            className="bg-card/95 backdrop-blur-sm border-border/50 hover:shadow-md transition-all duration-200 cursor-pointer"
            onClick={() => navigate(`/clubs/${club.id}`)}
          >
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {club.logo ? (
                        <img
                          src={club.logo}
                          alt={club.name}
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                          {getClubInitials(club.name)}
                        </div>
                      )}
                      <div>
                        <h3 className="text-lg font-semibold">{club.name}</h3>
                        {club.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {club.description}
                          </p>
                        )}
                      </div>
                    </div>
                    {typeLabel && (
                      <Badge variant="secondary" className="text-xs">
                        {typeLabel}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    {location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{location}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {memberCount} member{memberCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {upcomingCount} upcoming show{upcomingCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={e => {
                      e.stopPropagation();
                      navigate(`/clubs/${club.id}`);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Club
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default ClubsListView;
