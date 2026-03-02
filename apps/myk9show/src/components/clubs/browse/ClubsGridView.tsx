import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Users, Calendar, Eye } from 'lucide-react';
import { getClubInitials } from '@/components/clubs/ClubDetails/utils';
import { CLUB_TYPES } from '@/types/club-types';
import type { Club } from '@/types/club-types';

interface ClubsGridViewProps {
  clubs: Club[];
  clubShowCounts: Map<string, number>;
}

/** Get human-readable label for a club type value */
function getClubTypeLabel(clubType: string | undefined): string | null {
  if (!clubType) return null;
  return CLUB_TYPES.find(t => t.value === clubType)?.label || clubType;
}

export const ClubsGridView: React.FC<ClubsGridViewProps> = ({ clubs, clubShowCounts }) => {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {clubs.map(club => {
        const upcomingCount = clubShowCounts.get(club.id) || 0;
        const memberCount = club.memberIds?.length || 0;
        const typeLabel = getClubTypeLabel(club.clubType);
        const location = [club.address?.city, club.address?.state].filter(Boolean).join(', ');

        return (
          <div
            key={club.id}
            className="myk9-browse-card cursor-pointer"
            onClick={() => navigate(`/clubs/${club.id}`)}
            role="link"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && navigate(`/clubs/${club.id}`)}
          >
            <div className="myk9-browse-card-header">
              <div className="myk9-browse-card-badges">
                {typeLabel && (
                  <Badge variant="secondary" className="text-xs">
                    {typeLabel}
                  </Badge>
                )}
              </div>
            </div>

            <div className="myk9-browse-card-content">
              {/* Club identity: logo/initials + name */}
              <div className="flex items-center gap-3 mb-2">
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
                <h3 className="myk9-browse-card-title">{club.name}</h3>
              </div>

              {club.description && (
                <p className="myk9-browse-card-description line-clamp-2">{club.description}</p>
              )}

              <div className="myk9-browse-card-details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {location && (
                    <div className="myk9-browse-card-detail-item">
                      <MapPin className="h-4 w-4" />
                      <span>{location}</span>
                    </div>
                  )}

                  <div className="myk9-browse-card-detail-item">
                    <Users className="h-4 w-4" />
                    <span>
                      {memberCount} member{memberCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="myk9-browse-card-detail-item">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {upcomingCount} upcoming show{upcomingCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>

              <div className="myk9-browse-card-footer">
                <div />
                <Button
                  variant="outline"
                  size="sm"
                  className="myk9-browse-view-details-btn"
                  onClick={e => {
                    e.stopPropagation();
                    navigate(`/clubs/${club.id}`);
                  }}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View Club
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ClubsGridView;
