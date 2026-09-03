import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Club } from '@/types/club-types';
import type { ClubMember } from '@/types/club-membership-types';
import { Mail, MoreVertical, UserMinus, Eye } from 'lucide-react';
import { removeClubMember } from '@/services/database/club-memberships';
import { DeleteConfirmationDialog } from '@/components/base/DeleteConfirmationDialog';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';

// Helper to get initials from name
const getInitials = (name: string): string => {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('');
  return initials || '?';
};

interface MemberListProps {
  club: Club;
  members: ClubMember[];
  canManageMembers?: boolean;
}

export const MemberList: React.FC<MemberListProps> = ({
  club,
  members,
  canManageMembers = false,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // State for remove member confirmation
  const [memberToRemove, setMemberToRemove] = useState<ClubMember | null>(null);
  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => removeClubMember(memberId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['club-members', club.id] });
    },
  });

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;

    try {
      await removeMemberMutation.mutateAsync(memberToRemove.id);
      notifications.success(`${memberToRemove.personName || 'Member'} removed from club`);
    } catch (error) {
      logger.error('Failed to remove member', 'clubs', {}, error as Error);
      notifications.error('Failed to remove member');
    } finally {
      setMemberToRemove(null);
    }
  };

  if (members.length === 0) {
    return null; // Empty state is handled by parent component
  }

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map(member => {
            const personName = member.personName || 'Unknown member';

            return (
              <div
                key={member.id}
                className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12 flex-shrink-0">
                    <AvatarImage alt={personName} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {getInitials(personName)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-foreground truncate">{personName}</h4>
                    </div>
                    {member.personEmail && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1 truncate">
                        <Mail className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{member.personEmail}</span>
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
                        <DropdownMenuItem onClick={() => navigate(`/people/${member.personId}`)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setMemberToRemove(member)}
                          className="text-destructive focus:text-destructive"
                        >
                          <UserMinus className="mr-2 h-4 w-4" />
                          Remove Member
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Remove Member Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={!!memberToRemove}
        onOpenChange={open => {
          if (!open) setMemberToRemove(null);
        }}
        onConfirm={handleRemoveMember}
        entityName={memberToRemove?.personName || 'Member'}
        entityType="Member"
        description="This will remove the member from this club. They can be re-added later."
        isDeleting={removeMemberMutation.isPending}
      />
    </>
  );
};
