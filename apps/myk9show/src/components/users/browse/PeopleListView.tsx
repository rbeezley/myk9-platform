import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Eye } from 'lucide-react';
import { extractPersonName } from '@/components/users/UserDetails/userDetailsTypes';
import type { User } from '@/types/user-types';

interface PeopleListViewProps {
  people: User[];
}

function getPersonInitial(person: User): string {
  const { fullName } = extractPersonName(person);
  return (fullName || '?').charAt(0).toUpperCase();
}

function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export const PeopleListView: React.FC<PeopleListViewProps> = ({ people }) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {people.map(person => {
        const { fullName } = extractPersonName(person);
        const personRecord = person as unknown as Record<string, unknown>;
        const profileImage =
          person.profileImage ||
          (personRecord.profile_image_url as string) ||
          (personRecord.profile_image as string);

        return (
          <Card
            key={person.id}
            className="bg-card/95 backdrop-blur-sm border-border/50 hover:shadow-md transition-all duration-200 cursor-pointer"
            onClick={() => navigate(`/users/${person.id}`)}
          >
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
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
                      <div>
                        <h3 className="text-lg font-semibold">{fullName}</h3>
                        {person.email && (
                          <p className="text-sm text-muted-foreground">{person.email}</p>
                        )}
                      </div>
                    </div>
                    {person.roles && person.roles.length > 0 && (
                      <div className="flex gap-1">
                        {person.roles.slice(0, 2).map(role => (
                          <Badge
                            key={role}
                            variant="secondary"
                            className="text-xs bg-primary/10 text-primary"
                          >
                            {formatRole(role)}
                          </Badge>
                        ))}
                        {person.roles.length > 2 && (
                          <Badge
                            variant="secondary"
                            className="text-xs bg-muted text-muted-foreground"
                          >
                            +{person.roles.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    {person.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate">{person.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={e => {
                      e.stopPropagation();
                      navigate(`/users/${person.id}`);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Person
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

export default PeopleListView;
