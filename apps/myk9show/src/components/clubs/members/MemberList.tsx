import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useUserStore } from '@/store/userStore';
import { useClubStore } from '@/store/clubStore';
import { Club } from '@/types/club-types';
import { User } from '@/types/user-types';
import { Mail, Phone, MoreVertical, UserMinus, Eye, Shield } from 'lucide-react';
import { ClubAdminService } from '@/services/clubAdminService';
import { logger } from '@/services/LoggingService';

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
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-foreground">
                    {person.firstName} {person.lastName}
                  </h4>
                  {isClubAdmin(person) && (
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                      <Shield className="w-3 h-3" />
                      Admin
                    </div>
                  )}
                </div>
                {person.email && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Mail className="w-3 h-3" />
                    {person.email}
                  </div>
                )}
                {person.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-3 h-3" />
                    {person.phone}
                  </div>
                )}
              </div>
              
              {canManageMembers && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
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
                      disabled={isClubAdmin(person)} // Don't allow removing club admin
                    >
                      <UserMinus className="mr-2 h-4 w-4" />
                      Remove Member
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            
            {/* Additional member info */}
            <div className="pt-2 border-t border-border">
              <div className="text-xs text-muted-foreground">
                Member since: {new Date().toLocaleDateString()} {/* Mock data - would be real join date */}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};