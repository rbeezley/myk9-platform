import React from 'react';
import { Users, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Club } from '@/types/club-types';
import { MemberList } from '../members/MemberList';

interface MembersTabProps {
  club: Club;
  canManageMembers: boolean;
  onAddMember: () => void;
}

export const MembersTab: React.FC<MembersTabProps> = ({
  club,
  canManageMembers,
  onAddMember,
}) => {
  const memberCount = club.memberIds?.length || 0;

  if (memberCount === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16 px-8 bg-muted/50 rounded-2xl border border-dashed border-border">
          <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-60" />
          <div className="text-lg font-medium mb-2 text-foreground">No Members Yet</div>
          <div className="text-sm text-muted-foreground leading-relaxed mb-5">
            This club doesn't have any members yet. {canManageMembers ? 'Add your first member to get started.' : 'Only club admins can add members.'}
          </div>
          {canManageMembers && (
            <Button onClick={onAddMember} className="inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add First Member
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Club Members</h3>
          {canManageMembers && (
            <Button onClick={onAddMember} className="min-h-[44px]">
              <Plus className="w-5 h-5 mr-2" />
              Add Member
            </Button>
          )}
        </div>
        <MemberList club={club} canManageMembers={canManageMembers} />
      </div>
    </div>
  );
};
