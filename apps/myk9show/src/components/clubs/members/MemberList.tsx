import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUserStore } from '@/store/userStore';
import { useClubStore } from '@/store/clubStore';
import { Club } from '@/types/club-types';
import { User } from '@/types/user-types';
import { Mail, Phone, MoreVertical, UserMinus, Eye, Shield } from 'lucide-react';
import { ClubAdminService } from '@/services/clubAdminService';
import { logger } from '@/services/LoggingService';

// Helper to get initials from name
const getInitials = (firstName: string, lastName: string): string => {
  const first = firstName?.charAt(0)?.toUpperCase() || '';
  const last = lastName?.charAt(0)?.toUpperCase() || '';
  return `${first}${last}` || '?';
};

interface MemberListProps {
  club: Club;
  canManageMembers?: boolean;
}

export const MemberList: React.FC<MemberListProps> = ({ club, canManageMembers = false }) => {
  const people = useUserStore(state => state.people);
  const updateClub = useClubStore(state => state.updateClub);

  // Get member data from people store
  const members = people.filter(person => 
    club.memberIds?.includes(person.id.toString())
  );

  const handleRemoveMember = async (personId: string) => {
    const updatedClub: Club = {
      ...club,
      memberIds: (club.memberIds || []).filter(id => id !== personId)
    };
    await updateClub(updatedClub);
  };

  const isClubAdmin = (person: User) => {
    return ClubAdminService.isClubAdmin(person.id.toString(), club.id);
  };

  if (members.length === 0) {
    return null; // Empty state is handled by parent component
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((person) => (
          <div key={person.id} className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-all duration-200">
            <div className="flex items-start gap-3">
              <Avatar className="h-12 w-12 flex-shrink-0">
                <AvatarImage src={(person as { avatar?: string }).avatar} alt={`${person.firstName} ${person.lastName}`} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {getInitials(person.firstName, person.lastName)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-foreground truncate">
                    {person.firstName} {person.lastName}
                  </h4>
                  {isClubAdmin(person) && (
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium flex-shrink-0">
                      <Shield className="w-3 h-3" />
                      Admin
                    </div>
                  )}
                </div>
                {person.email && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1 truncate">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{person.email}</span>
                  </div>
                )}
                {person.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-3 h-3 flex-shrink-0" />
                    {person.phone}
                  </div>
                )}
              </div>

              {canManageMembers && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => logger.debug('View details:', 'clubs', { firstName: person.firstName, lastName: person.lastName })}>
                      <Eye className="mr-2 h-4 w-4" />
                      View Details
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleRemoveMember(person.id.toString())}
                      className="text-red-600 focus:text-red-600"
                      disabled={isClubAdmin(person)}
                    >
                      <UserMinus className="mr-2 h-4 w-4" />
                      Remove Member
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};