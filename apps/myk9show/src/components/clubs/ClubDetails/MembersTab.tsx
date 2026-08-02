import React from 'react';
import { AlertTriangle, Users, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Club } from '@/types/club-types';
import type { ClubMember } from '@/types/club-membership-types';
import { MemberList } from '../members/MemberList';

interface MembersTabProps {
  club: Club;
  members: ClubMember[];
  isLoading: boolean;
  isRefreshing: boolean;
  isError: boolean;
  onRetry: () => void;
  canManageMembers: boolean;
  onAddMember: () => void;
}

export const MembersTab: React.FC<MembersTabProps> = ({
  club,
  members,
  isLoading,
  isRefreshing,
  isError,
  onRetry,
  canManageMembers,
  onAddMember,
}) => {
  if (isLoading) {
    return (
      <div role="status" aria-label="Loading club members" className="space-y-4">
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(index => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mb-3 h-8 w-8 text-destructive" />
        <h3 className="text-lg font-semibold">We couldn&apos;t load club members</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Check your connection and try again. Your club membership data is unchanged.
        </p>
        <Button onClick={onRetry} className="mt-4">
          Try again
        </Button>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16 px-8 bg-muted/50 rounded-2xl border border-dashed border-border">
          <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-60" />
          <div className="text-lg font-medium mb-2 text-foreground">No Members Yet</div>
          <div className="text-sm text-muted-foreground leading-relaxed mb-5">
            This club doesn't have any members yet.{' '}
            {canManageMembers
              ? 'Add your first member to get started.'
              : 'Only club admins can add members.'}
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
          {isRefreshing && (
            <span
              role="status"
              aria-label="Updating members"
              className="text-sm text-muted-foreground"
            >
              Updating members…
            </span>
          )}
          {canManageMembers && (
            <Button onClick={onAddMember} className="min-h-[44px]">
              <Plus className="w-5 h-5 mr-2" />
              Add Member
            </Button>
          )}
        </div>
        <MemberList club={club} members={members} canManageMembers={canManageMembers} />
      </div>
    </div>
  );
};
