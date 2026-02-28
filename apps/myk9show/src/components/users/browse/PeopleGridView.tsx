import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Eye } from 'lucide-react';
import { extractPersonName } from '@/components/users/UserDetails/userDetailsTypes';
import type { User } from '@/types/user-types';

interface PeopleGridViewProps {
  people: User[];
}

function getPersonInitial(person: User): string {
  const { fullName } = extractPersonName(person);
  return (fullName || '?').charAt(0).toUpperCase();
}

function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export const PeopleGridView: React.FC<PeopleGridViewProps> = ({ people }) => {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {people.map(person => {
        const { fullName } = extractPersonName(person);
        const personRecord = person as unknown as Record<string, unknown>;
        const profileImage =
          person.profileImage ||
          (personRecord.profile_image_url as string) ||
          (personRecord.profile_image as string);

        return (
          <div
            key={person.id}
            className="apple-browse-card cursor-pointer"
            onClick={() => navigate(`/users/${person.id}`)}
            role="link"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && navigate(`/users/${person.id}`)}
          >
            <div className="apple-browse-card-header">
              <div className="apple-browse-card-badges">
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
              </div>
            </div>

            <div className="apple-browse-card-content">
              {/* Person identity: photo/initial + full name */}
              <div className="flex items-center gap-3 mb-2">
                {profileImage ? (
                  <img
                    src={profileImage}
                    alt={fullName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                    {getPersonInitial(person)}
                  </div>
                )}
                <h3 className="apple-browse-card-title">{fullName}</h3>
              </div>

              <div className="apple-browse-card-details">
                <div className="grid grid-cols-1 gap-2">
                  {person.email && (
                    <div className="apple-browse-card-detail-item">
                      <Mail className="h-4 w-4" />
                      <span className="truncate">{person.email}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="apple-browse-card-footer">
                <div />
                <Button
                  variant="outline"
                  size="sm"
                  className="apple-browse-view-details-btn"
                  onClick={e => {
                    e.stopPropagation();
                    navigate(`/users/${person.id}`);
                  }}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View Person
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PeopleGridView;
